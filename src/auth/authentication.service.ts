import { Inject, Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import { hash as hashPassword, verify as verifyPassword, argon2id } from 'argon2';
import { ApplicationException } from '../common/errors/application.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { RedisService } from '../common/redis/redis.service';
import { SecretHashService } from '../common/security/secret-hash.service';
import {
  OTP_DELIVERY_PORT,
  type OtpDeliveryPort,
} from '../notifications/otp-delivery.port';
import { AuthenticationFailedException } from './authentication-failed.exception';
import { AuthenticationRepository } from './authentication.repository';
import type {
  AuthenticationTokensResponse,
  OtpChallengeResponse,
  SuperAdminChallengeResponse,
} from './authentication.types';
import { JwtTokenService } from './jwt-token.service';
import { RateLimitService } from './rate-limit.service';

const OTP_LIFETIME_MS = 5 * 60 * 1000;
const MFA_CHALLENGE_SECONDS = 5 * 60;
const DUMMY_PASSWORD = 'not-a-valid-administrator-password';

@Injectable()
export class AuthenticationService {
  private readonly dummyPasswordHash = hashPassword(DUMMY_PASSWORD, {
    type: argon2id,
  });

  constructor(
    @Inject(AuthenticationRepository)
    private readonly repository: AuthenticationRepository,
    @Inject(JwtTokenService) private readonly jwtTokens: JwtTokenService,
    @Inject(RateLimitService) private readonly rateLimits: RateLimitService,
    @Inject(SecretHashService) private readonly secretHash: SecretHashService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(OTP_DELIVERY_PORT) private readonly otpDelivery: OtpDeliveryPort,
  ) {}

  async createOtpChallenge(
    phoneNumber: string,
    requestIp: string,
  ): Promise<OtpChallengeResponse> {
    const phoneHash = this.secretHash.hashSensitiveLookup(phoneNumber);
    const ipHash = this.secretHash.hashSensitiveLookup(requestIp);
    await this.rateLimits.assertCooldown(`otp:cooldown:${phoneHash}`, 60);
    await this.rateLimits.assertWithinLimit(`otp:phone:${phoneHash}`, 3, 15 * 60);
    await this.rateLimits.assertWithinLimit(`otp:ip:${ipHash}`, 10, 15 * 60);

    const challengeId = randomUUID();
    const otpCode = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + OTP_LIFETIME_MS);
    await this.repository.createOtpChallenge({
      challengeId,
      phoneNumber,
      codeDigest: this.secretHash.hashOtp(challengeId, phoneNumber, otpCode),
      expiresAt,
    });
    try {
      await this.otpDelivery.deliverOtp({
        challengeId,
        destination: phoneNumber,
        otpCode,
        expiresAt,
      });
    } catch {
      await this.repository.markOtpDeliveryFailed(challengeId);
      throw new ApplicationException(
        ErrorCode.SMS_DELIVERY_UNAVAILABLE,
        'SMS delivery is temporarily unavailable.',
      );
    }
    return {
      challengeId,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  async createResidentSession(input: {
    readonly challengeId: string;
    readonly otpCode: string;
    readonly deviceName?: string;
  }): Promise<AuthenticationTokensResponse> {
    const session = await this.repository.consumeOtpChallenge(input);
    return this.issueTokens(session, true);
  }

  async refreshResidentSession(
    refreshToken: string,
  ): Promise<AuthenticationTokensResponse> {
    const context = await this.repository.getRefreshTokenContext(refreshToken);
    if (!context || context.clientType !== 'resident_mobile') {
      throw new AuthenticationFailedException();
    }
    const session = await this.repository.rotateRefreshToken(refreshToken);
    return this.issueTokens(session, true);
  }

  async createSuperAdminChallenge(
    email: string,
    password: string,
    requestIp: string,
  ): Promise<SuperAdminChallengeResponse> {
    const identityHash = this.secretHash.hashSensitiveLookup(email);
    const ipHash = this.secretHash.hashSensitiveLookup(requestIp);
    await this.rateLimits.assertWithinLimit(`admin-login:identity:${identityHash}`, 5, 15 * 60);
    await this.rateLimits.assertWithinLimit(`admin-login:ip:${ipHash}`, 20, 15 * 60);
    const credential = await this.repository.findSuperAdminPassword(email);
    const passwordHash = credential?.passwordHash ?? (await this.dummyPasswordHash);
    const valid = await verifyPassword(passwordHash, password).catch(() => false);
    if (!credential || !valid) {
      throw new AuthenticationFailedException();
    }
    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + MFA_CHALLENGE_SECONDS * 1000);
    await this.redis.ensureConnected();
    await this.redis.client.set(
      `admin-mfa:${challengeId}`,
      credential.userId,
      { EX: MFA_CHALLENGE_SECONDS },
    );
    return { challengeId, expiresAt: expiresAt.toISOString() };
  }

  async createSuperAdminSession(
    challengeId: string,
    verificationCode: string,
  ): Promise<AuthenticationTokensResponse & { readonly csrfToken: string }> {
    const challengeKey = `admin-mfa:${challengeId}`;
    await this.redis.ensureConnected();
    const userId = await this.redis.client.get(challengeKey);
    if (!userId) {
      throw new AuthenticationFailedException();
    }
    await this.rateLimits.assertWithinLimit(`admin-mfa-attempt:${challengeId}`, 5, 5 * 60);
    if (!(await this.repository.consumeSuperAdminMfa(userId, verificationCode))) {
      throw new AuthenticationFailedException();
    }
    await this.redis.client.del(challengeKey);
    const session = await this.repository.createSuperAdminSession(userId);
    return {
      ...(await this.issueTokens(session, false)),
      csrfToken: this.secretHash.hashCsrf(session.sessionId, session.refreshToken),
      refreshToken: session.refreshToken,
    };
  }

  async refreshSuperAdminSession(
    refreshToken: string,
    csrfToken: string,
  ): Promise<AuthenticationTokensResponse & { readonly csrfToken: string }> {
    const context = await this.repository.getRefreshTokenContext(refreshToken);
    if (!context || context.clientType !== 'super_admin_web') {
      throw new AuthenticationFailedException();
    }
    const expected = this.secretHash.hashCsrf(context.sessionId, refreshToken);
    if (!this.secretHash.isEqual(expected, csrfToken)) {
      throw new AuthenticationFailedException();
    }
    const session = await this.repository.rotateRefreshToken(refreshToken);
    if (session.clientType !== 'super_admin_web') {
      throw new AuthenticationFailedException();
    }
    return {
      ...(await this.issueTokens(session, false)),
      csrfToken: this.secretHash.hashCsrf(session.sessionId, session.refreshToken),
      refreshToken: session.refreshToken,
    };
  }

  private async issueTokens(
    session: {
      readonly userId: string;
      readonly sessionId: string;
      readonly clientType: 'resident_mobile' | 'super_admin_web' | 'city_admin_web' | 'gate_worker_mobile';
      readonly refreshToken: string;
      readonly refreshTokenExpiresAt: Date;
    },
    includeRefreshToken: boolean,
  ): Promise<AuthenticationTokensResponse> {
    const access = await this.jwtTokens.issueAccessToken(session);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      ...(includeRefreshToken ? { refreshToken: session.refreshToken } : {}),
      refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(),
      sessionId: session.sessionId,
      userId: session.userId,
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  decodeProtectedHeader,
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from 'jose';
import { SecurityConfigService } from '../config/security-config.service';
import { AuthenticationFailedException } from './authentication-failed.exception';

const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
const JWT_ISSUER = 'public-parks-backend';

export interface VerifiedAccessToken {
  readonly userId: string;
  readonly sessionId: string;
  readonly clientType:
    | 'resident_mobile'
    | 'super_admin_web'
    | 'city_admin_web'
    | 'gate_worker_mobile';
}

@Injectable()
export class JwtTokenService {
  constructor(
    @Inject(SecurityConfigService)
    private readonly securityConfig: SecurityConfigService,
  ) {}

  async issueAccessToken(input: VerifiedAccessToken): Promise<{
    readonly token: string;
    readonly expiresAt: Date;
  }> {
    const keyId = this.securityConfig.activeJwtKeyId;
    const key = this.securityConfig.jwtKeys.get(keyId);
    if (!key) {
      throw new Error(`Active JWT key is unavailable: ${keyId}`);
    }
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = issuedAt + ACCESS_TOKEN_LIFETIME_SECONDS;
    const token = await new SignJWT({
      sessionId: input.sessionId,
      clientType: input.clientType,
    })
      .setProtectedHeader({ alg: 'HS256', kid: keyId, typ: 'JWT' })
      .setSubject(input.userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(input.clientType)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAtSeconds)
      .setJti(randomUUID())
      .sign(key);
    return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
  }

  async verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
    try {
      const header = decodeProtectedHeader(token);
      const key = header.kid
        ? this.securityConfig.jwtKeys.get(header.kid)
        : undefined;
      if (!key || header.alg !== 'HS256') {
        throw new AuthenticationFailedException();
      }
      const result = await jwtVerify(token, key, { issuer: JWT_ISSUER });
      return this.parsePayload(result.payload);
    } catch (error) {
      if (error instanceof AuthenticationFailedException) {
        throw error;
      }
      throw new AuthenticationFailedException();
    }
  }

  private parsePayload(payload: JWTPayload): VerifiedAccessToken {
    const clientType = payload.clientType;
    const sessionId = payload.sessionId;
    if (
      typeof payload.sub !== 'string' ||
      typeof sessionId !== 'string' ||
      ![
        'resident_mobile',
        'super_admin_web',
        'city_admin_web',
        'gate_worker_mobile',
      ].includes(String(clientType)) ||
      payload.aud !== clientType
    ) {
      throw new AuthenticationFailedException();
    }
    return {
      userId: payload.sub,
      sessionId,
      clientType: clientType as VerifiedAccessToken['clientType'],
    };
  }
}

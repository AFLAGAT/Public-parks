import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { SecurityConfigService } from '../../config/security-config.service';

@Injectable()
export class SecretHashService {
  constructor(
    @Inject(SecurityConfigService)
    private readonly securityConfig: SecurityConfigService,
  ) {}

  hashOtp(challengeId: string, phoneNumber: string, otpCode: string): string {
    return this.createDigest(
      this.securityConfig.otpHashKey,
      `${challengeId}:${phoneNumber}:${otpCode}`,
    );
  }

  hashToken(token: string): string {
    return this.createDigest(this.securityConfig.tokenHashKey, token);
  }

  hashSensitiveLookup(value: string): string {
    return this.createDigest(this.securityConfig.tokenHashKey, value);
  }

  hashCsrf(sessionId: string, refreshToken: string): string {
    return this.createDigest(
      this.securityConfig.csrfKey,
      `${sessionId}:${refreshToken}`,
    );
  }

  isEqual(expectedHex: string, actualHex: string): boolean {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = Buffer.from(actualHex, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private createDigest(key: Buffer, value: string): string {
    return createHmac('sha256', key).update(value, 'utf8').digest('hex');
  }
}

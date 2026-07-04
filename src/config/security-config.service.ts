import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

function parseKeyRing(serialized: string): ReadonlyMap<string, Buffer> {
  const parsed = JSON.parse(serialized) as Record<string, string>;
  return new Map(
    Object.entries(parsed).map(([keyId, value]) => [
      keyId,
      Buffer.from(value, 'base64'),
    ]),
  );
}

@Injectable()
export class SecurityConfigService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  get jwtKeys(): ReadonlyMap<string, Buffer> {
    return parseKeyRing(String(this.config.get('AUTH_JWT_KEYS_JSON', { infer: true })));
  }

  get activeJwtKeyId(): string {
    return this.config.get('AUTH_JWT_ACTIVE_KEY_ID', { infer: true });
  }

  get otpHashKey(): Buffer {
    return Buffer.from(String(this.config.get('AUTH_OTP_HASH_KEY', { infer: true })), 'base64');
  }

  get tokenHashKey(): Buffer {
    return Buffer.from(String(this.config.get('AUTH_TOKEN_HASH_KEY', { infer: true })), 'base64');
  }

  get csrfKey(): Buffer {
    return Buffer.from(String(this.config.get('AUTH_CSRF_KEY', { infer: true })), 'base64');
  }

  get fieldEncryptionKeys(): ReadonlyMap<string, Buffer> {
    return parseKeyRing(
      String(this.config.get('APP_FIELD_ENCRYPTION_KEYS_JSON', { infer: true })),
    );
  }

  get activeFieldEncryptionKeyId(): string {
    return this.config.get('APP_FIELD_ENCRYPTION_ACTIVE_KEY_ID', { infer: true });
  }

  get superAdminWebOrigins(): readonly string[] {
    return String(this.config
      .get('SUPER_ADMIN_WEB_ORIGINS', { infer: true }))
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  get devSmsInboxToken(): string {
    return String(this.config.get('DEV_SMS_INBOX_TOKEN', { infer: true }));
  }
}

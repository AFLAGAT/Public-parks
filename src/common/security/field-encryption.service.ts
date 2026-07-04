import { Inject, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import { SecurityConfigService } from '../../config/security-config.service';
import type { EncryptedFieldPayload } from '../../database/drizzle.schema';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const INITIALIZATION_VECTOR_BYTES = 12;

@Injectable()
export class FieldEncryptionService {
  constructor(
    @Inject(SecurityConfigService)
    private readonly securityConfig: SecurityConfigService,
  ) {}

  encryptJson(value: unknown, associatedData: string): EncryptedFieldPayload {
    const keyId = this.securityConfig.activeFieldEncryptionKeyId;
    const key = this.securityConfig.fieldEncryptionKeys.get(keyId);
    if (!key) {
      throw new Error(`Active field-encryption key is unavailable: ${keyId}`);
    }

    const iv = randomBytes(INITIALIZATION_VECTOR_BYTES);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);

    return {
      keyId,
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decryptJson<T>(payload: EncryptedFieldPayload, associatedData: string): T {
    const key = this.securityConfig.fieldEncryptionKeys.get(payload.keyId);
    if (!key) {
      throw new Error(`Field-encryption key is unavailable: ${payload.keyId}`);
    }

    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      key,
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as T;
  }
}

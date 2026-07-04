import { describe, expect, it } from 'vitest';
import type { SecurityConfigService } from '../../config/security-config.service';
import { FieldEncryptionService } from './field-encryption.service';

function createService(): FieldEncryptionService {
  const key = Buffer.alloc(32, 7);
  const config = {
    activeFieldEncryptionKeyId: 'test-v1',
    fieldEncryptionKeys: new Map([['test-v1', key]]),
  } as unknown as SecurityConfigService;
  return new FieldEncryptionService(config);
}

describe('FieldEncryptionService', () => {
  it('round-trips JSON without placing plaintext in the stored payload', () => {
    const service = createService();
    const plaintext = { apiKey: 'top-secret-value' };
    const encrypted = service.encryptJson(plaintext, 'sms:test:1');

    expect(JSON.stringify(encrypted)).not.toContain(plaintext.apiKey);
    expect(encrypted).toMatchObject({ keyId: 'test-v1' });
    expect(service.decryptJson(encrypted, 'sms:test:1')).toEqual(plaintext);
  });

  it('authenticates associated data', () => {
    const service = createService();
    const encrypted = service.encryptJson({ secret: 'value' }, 'correct-context');

    expect(() => service.decryptJson(encrypted, 'wrong-context')).toThrow();
  });
});

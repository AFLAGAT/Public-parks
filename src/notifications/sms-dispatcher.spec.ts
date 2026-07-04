import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import type { SecretHashService } from '../common/security/secret-hash.service';
import type { SmsConfigurationRepository } from './sms-configuration.repository';
import type { SmsConfigurationResolver } from './sms-configuration.resolver';
import type { SmsConfigurationRecord } from './sms-configuration.types';
import { SmsDispatcher } from './sms-dispatcher';
import { SmsProviderRegistry } from './sms-provider.registry';
import type { SendSmsResult, SmsProvider } from './sms-provider.types';

const record: SmsConfigurationRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  scopeType: 'platform',
  scopeId: null,
  providerKey: 'fake',
  displayName: 'Fake',
  apiUrl: null,
  encryptedCredentials: { keyId: 'x', iv: 'x', ciphertext: 'x', authTag: 'x' },
  senderId: null,
  timeoutMs: 20,
  retryCount: 1,
  isEnabled: true,
  isActive: false,
  revision: 1,
  lastSuccessfulTestRevision: null,
  activatedAt: null,
  deactivatedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function createDispatcher(sendSms: SmsProvider['sendSms'], retryCount = 1) {
  const insertDeliveryAttempt = vi.fn().mockResolvedValue(undefined);
  const repository = {
    decryptCredentials: () => ({}),
    insertDeliveryAttempt,
  } as unknown as SmsConfigurationRepository;
  const provider: SmsProvider = {
    providerKey: 'fake',
    displayName: 'Fake',
    credentialFields: [],
    validateConfiguration: () => [],
    isApiHostPermitted: () => true,
    sendSms,
  };
  const dispatcher = new SmsDispatcher(
    {} as SmsConfigurationResolver,
    new SmsProviderRegistry([provider]),
    repository,
    { hashSensitiveLookup: () => 'destination-hash' } as unknown as SecretHashService,
    { isDevelopment: true, isTest: false } as AppConfigService,
  );
  return {
    dispatcher,
    insertDeliveryAttempt,
    configuredRecord: { ...record, retryCount },
  };
}

describe('SmsDispatcher', () => {
  it('retries only transient provider failures', async () => {
    const sendSms = vi
      .fn<SmsProvider['sendSms']>()
      .mockResolvedValueOnce({
        success: false,
        classification: 'transient',
        errorCode: 'TEMPORARY',
      })
      .mockResolvedValueOnce({ success: true, providerMessageId: 'sent-1' });
    const { dispatcher, insertDeliveryAttempt, configuredRecord } = createDispatcher(
      sendSms,
      1,
    );

    await expect(
      dispatcher.sendConfiguredTest({
        record: configuredRecord,
        destination: '+12025550123',
        message: 'fixed test',
        idempotencyKey: 'test-1',
      }),
    ).resolves.toEqual({ success: true, providerMessageId: 'sent-1' });
    expect(sendSms).toHaveBeenCalledTimes(2);
    expect(insertDeliveryAttempt).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent failures', async () => {
    const result: SendSmsResult = {
      success: false,
      classification: 'permanent',
      errorCode: 'INVALID_DESTINATION',
    };
    const sendSms = vi.fn().mockResolvedValue(result);
    const { dispatcher, configuredRecord } = createDispatcher(sendSms, 3);

    await expect(
      dispatcher.sendConfiguredTest({
        record: configuredRecord,
        destination: '+12025550123',
        message: 'fixed test',
        idempotencyKey: 'test-2',
      }),
    ).resolves.toEqual(result);
    expect(sendSms).toHaveBeenCalledOnce();
  });

  it('classifies a provider timeout as transient', async () => {
    const sendSms = vi.fn(
      () => new Promise<SendSmsResult>(() => undefined),
    );
    const { dispatcher, configuredRecord } = createDispatcher(sendSms, 0);

    await expect(
      dispatcher.sendConfiguredTest({
        record: { ...configuredRecord, timeoutMs: 5 },
        destination: '+12025550123',
        message: 'fixed test',
        idempotencyKey: 'test-3',
      }),
    ).resolves.toMatchObject({
      success: false,
      classification: 'transient',
      errorCode: 'TIMEOUT',
    });
  });
});

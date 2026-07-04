import { Inject, Injectable } from '@nestjs/common';
import { setTimeout as delay } from 'timers/promises';
import { AppConfigService } from '../config/app-config.service';
import { ApplicationException } from '../common/errors/application.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { SecretHashService } from '../common/security/secret-hash.service';
import { SmsConfigurationRepository } from './sms-configuration.repository';
import { SmsConfigurationResolver } from './sms-configuration.resolver';
import type { SmsConfigurationRecord } from './sms-configuration.types';
import { SmsProviderRegistry } from './sms-provider.registry';
import type {
  ResolvedSmsConfiguration,
  SendSmsResult,
  SmsProvider,
} from './sms-provider.types';

@Injectable()
export class SmsDispatcher {
  constructor(
    @Inject(SmsConfigurationResolver)
    private readonly resolver: SmsConfigurationResolver,
    @Inject(SmsProviderRegistry) private readonly registry: SmsProviderRegistry,
    @Inject(SmsConfigurationRepository)
    private readonly repository: SmsConfigurationRepository,
    @Inject(SecretHashService) private readonly secretHash: SecretHashService,
    @Inject(AppConfigService) private readonly appConfig: AppConfigService,
  ) {}

  async send(input: {
    readonly destination: string;
    readonly message: string;
    readonly idempotencyKey: string;
    readonly purpose: string;
    readonly cityId?: string;
  }): Promise<void> {
    const resolved = await this.resolver.resolve({ cityId: input.cityId });
    if (!resolved) throw this.unavailable();
    const result = await this.sendWithConfiguration(
      resolved.record,
      resolved.configuration,
      input,
    );
    if (!result.success) throw this.unavailable();
  }

  async sendConfiguredTest(input: {
    readonly record: SmsConfigurationRecord;
    readonly destination: string;
    readonly message: string;
    readonly idempotencyKey: string;
  }): Promise<SendSmsResult> {
    return this.sendWithConfiguration(
      input.record,
      {
        id: input.record.id,
        providerKey: input.record.providerKey,
        revision: input.record.revision,
        apiUrl: input.record.apiUrl,
        credentials: this.repository.decryptCredentials(input.record),
        senderId: input.record.senderId,
        timeoutMs: input.record.timeoutMs,
        retryCount: input.record.retryCount,
      },
      { ...input, purpose: 'configuration_test' },
    );
  }

  private async sendWithConfiguration(
    record: SmsConfigurationRecord,
    configuration: ResolvedSmsConfiguration,
    input: {
      readonly destination: string;
      readonly message: string;
      readonly idempotencyKey: string;
      readonly purpose: string;
    },
  ): Promise<SendSmsResult> {
    const provider = this.registry.get(configuration.providerKey);
    if (!provider || (provider.providerKey === 'mock' && !this.mockAllowed)) {
      return { success: false, classification: 'configuration', errorCode: 'PROVIDER_UNAVAILABLE' };
    }
    const errors = provider.validateConfiguration(configuration);
    if (errors.length > 0 || !provider.isApiHostPermitted(configuration.apiUrl)) {
      return { success: false, classification: 'configuration', errorCode: 'INVALID_CONFIGURATION' };
    }

    const destinationHash = this.secretHash.hashSensitiveLookup(input.destination);
    let lastResult: SendSmsResult = {
      success: false,
      classification: 'transient',
      errorCode: 'DELIVERY_FAILED',
    };
    for (let attempt = 1; attempt <= configuration.retryCount + 1; attempt += 1) {
      lastResult = await this.executeAttempt(provider, configuration, input);
      await this.repository.insertDeliveryAttempt({
        configuration: record,
        purpose: input.purpose,
        destinationHash,
        successful: lastResult.success,
        providerMessageId: lastResult.success ? lastResult.providerMessageId : undefined,
        errorCode: lastResult.success ? undefined : lastResult.errorCode,
        attemptNumber: attempt,
      });
      if (lastResult.success || lastResult.classification !== 'transient') break;
      if (attempt <= configuration.retryCount) {
        await delay(Math.min(100 * 2 ** (attempt - 1), 800));
      }
    }
    return lastResult;
  }

  private async executeAttempt(
    provider: SmsProvider,
    configuration: ResolvedSmsConfiguration,
    input: {
      readonly destination: string;
      readonly message: string;
      readonly idempotencyKey: string;
    },
  ): Promise<SendSmsResult> {
    const abortController = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        provider.sendSms({
          destination: input.destination,
          message: input.message,
          idempotencyKey: input.idempotencyKey,
          configuration,
          signal: abortController.signal,
        }),
        new Promise<SendSmsResult>((resolve) => {
          timeout = setTimeout(() => {
            abortController.abort();
            resolve({ success: false, classification: 'transient', errorCode: 'TIMEOUT' });
          }, configuration.timeoutMs);
        }),
      ]);
    } catch {
      return { success: false, classification: 'transient', errorCode: 'PROVIDER_ERROR' };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private get mockAllowed(): boolean {
    return this.appConfig.isDevelopment || this.appConfig.isTest;
  }

  private unavailable(): ApplicationException {
    return new ApplicationException(
      ErrorCode.SMS_DELIVERY_UNAVAILABLE,
      'SMS delivery is temporarily unavailable.',
    );
  }
}

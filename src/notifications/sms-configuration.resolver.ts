import { Inject, Injectable } from '@nestjs/common';
import { SmsConfigurationRepository } from './sms-configuration.repository';
import type { SmsConfigurationRecord } from './sms-configuration.types';
import type { ResolvedSmsConfiguration } from './sms-provider.types';

export interface ResolvedSmsConfigurationWithRecord {
  readonly configuration: ResolvedSmsConfiguration;
  readonly record: SmsConfigurationRecord;
}

@Injectable()
export class SmsConfigurationResolver {
  constructor(
    @Inject(SmsConfigurationRepository)
    private readonly repository: SmsConfigurationRepository,
  ) {}

  /**
   * `cityId` is intentionally accepted now so callers never need to change
   * when city overrides are introduced. Runtime resolution remains platform-only.
   */
  async resolve(context: { readonly cityId?: string } = {}): Promise<ResolvedSmsConfigurationWithRecord | null> {
    void context.cityId;
    const record = await this.repository.resolvePlatformActive();
    if (!record) return null;
    return {
      record,
      configuration: {
        id: record.id,
        providerKey: record.providerKey,
        revision: record.revision,
        apiUrl: record.apiUrl,
        credentials: this.repository.decryptCredentials(record),
        senderId: record.senderId,
        timeoutMs: record.timeoutMs,
        retryCount: record.retryCount,
      },
    };
  }
}

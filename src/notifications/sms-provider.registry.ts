import { Injectable } from '@nestjs/common';
import type { SmsProvider } from './sms-provider.types';

@Injectable()
export class SmsProviderRegistry {
  private readonly providers: ReadonlyMap<string, SmsProvider>;

  constructor(providers: readonly SmsProvider[]) {
    const entries = providers.map((provider) => [provider.providerKey, provider] as const);
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      throw new Error('SMS provider keys must be unique.');
    }
    this.providers = new Map(entries);
  }

  get(providerKey: string): SmsProvider | undefined {
    return this.providers.get(providerKey);
  }

  list(): readonly SmsProvider[] {
    return [...this.providers.values()];
  }
}

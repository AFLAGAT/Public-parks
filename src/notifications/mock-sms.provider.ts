import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  SendSmsRequest,
  SendSmsResult,
  SmsProvider,
  SmsProviderConfiguration,
} from './sms-provider.types';

const MESSAGE_TTL_MS = 10 * 60 * 1000;
const MAX_MESSAGES = 100;

export interface DevelopmentSmsMessage {
  readonly id: string;
  readonly destination: string;
  readonly message: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

@Injectable()
export class MockSmsProvider implements SmsProvider {
  readonly providerKey = 'mock';
  readonly displayName = 'Development Mock';
  readonly credentialFields = [] as const;
  private readonly messages: DevelopmentSmsMessage[] = [];

  validateConfiguration(configuration: SmsProviderConfiguration): readonly string[] {
    const errors: string[] = [];
    if (configuration.apiUrl !== null) errors.push('apiUrl must be empty.');
    if (Object.keys(configuration.credentials).length > 0) {
      errors.push('credentials must be empty.');
    }
    return errors;
  }

  isApiHostPermitted(apiUrl: string | null): boolean {
    return apiUrl === null;
  }

  sendSms(request: SendSmsRequest): Promise<SendSmsResult> {
    if (request.signal.aborted) {
      return Promise.resolve({ success: false, classification: 'transient', errorCode: 'TIMEOUT' });
    }
    this.purgeExpired();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + MESSAGE_TTL_MS);
    const id = randomUUID();
    this.messages.push({
      id,
      destination: request.destination,
      message: request.message,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    while (this.messages.length > MAX_MESSAGES) this.messages.shift();
    return Promise.resolve({ success: true, providerMessageId: id });
  }

  getMessages(): readonly DevelopmentSmsMessage[] {
    this.purgeExpired();
    return this.messages.slice().reverse();
  }

  clear(): void {
    this.messages.length = 0;
  }

  private purgeExpired(): void {
    const now = Date.now();
    while (
      this.messages.length > 0 &&
      Date.parse(this.messages[0]?.expiresAt ?? '') <= now
    ) {
      this.messages.shift();
    }
  }
}

export type SmsFailureClassification =
  | 'transient'
  | 'permanent'
  | 'configuration';

export interface SmsCredentialFieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
  readonly secret: true;
}

export interface SmsProviderConfiguration {
  readonly apiUrl: string | null;
  readonly credentials: Readonly<Record<string, string>>;
  readonly senderId: string | null;
  readonly timeoutMs: number;
  readonly retryCount: number;
}

export interface SendSmsRequest {
  readonly destination: string;
  readonly message: string;
  readonly idempotencyKey: string;
  readonly configuration: SmsProviderConfiguration;
  readonly signal: AbortSignal;
}

export type SendSmsResult =
  | {
      readonly success: true;
      readonly providerMessageId?: string;
    }
  | {
      readonly success: false;
      readonly classification: SmsFailureClassification;
      readonly errorCode: string;
    };

export interface SmsProvider {
  readonly providerKey: string;
  readonly displayName: string;
  readonly credentialFields: readonly SmsCredentialFieldDefinition[];
  validateConfiguration(configuration: SmsProviderConfiguration): readonly string[];
  isApiHostPermitted(apiUrl: string | null): boolean;
  sendSms(request: SendSmsRequest): Promise<SendSmsResult>;
}

export interface ResolvedSmsConfiguration extends SmsProviderConfiguration {
  readonly id: string;
  readonly providerKey: string;
  readonly revision: number;
}

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../config/app-config.service';
import { AuditLogsRepository } from '../audit-logs/audit-logs.repository';
import { ApplicationException } from '../common/errors/application.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { SecretHashService } from '../common/security/secret-hash.service';
import { SmsConfigurationRepository } from './sms-configuration.repository';
import type {
  CreateSmsConfigurationInput,
  CreateSmsRevisionInput,
  PatchSmsConfigurationInput,
  SmsConfigurationRecord,
} from './sms-configuration.types';
import { SmsDispatcher } from './sms-dispatcher';
import { SmsProviderRegistry } from './sms-provider.registry';
import type { SmsProvider, SmsProviderConfiguration } from './sms-provider.types';

@Injectable()
export class SmsConfigurationService {
  constructor(
    @Inject(SmsConfigurationRepository)
    private readonly repository: SmsConfigurationRepository,
    @Inject(SmsProviderRegistry) private readonly registry: SmsProviderRegistry,
    @Inject(SmsDispatcher) private readonly dispatcher: SmsDispatcher,
    @Inject(SecretHashService) private readonly secretHash: SecretHashService,
    @Inject(AuditLogsRepository) private readonly audits: AuditLogsRepository,
    @Inject(AppConfigService) private readonly appConfig: AppConfigService,
  ) {}

  listImplementations() {
    return this.registry.list().map((provider) => ({
      providerKey: provider.providerKey,
      displayName: provider.displayName,
      credentialFields: provider.credentialFields,
      available: provider.providerKey !== 'mock' || this.mockAllowed,
    }));
  }

  async listConfigurations() {
    return (await this.repository.listPlatform()).map((record) => this.toResponse(record));
  }

  async getConfiguration(id: string) {
    return this.toResponse(await this.requireRecord(id));
  }

  async create(input: CreateSmsConfigurationInput, actorUserId: string, correlationId?: string) {
    this.validateProviderInput(input.providerKey, {
      apiUrl: input.apiUrl ?? null,
      credentials: input.credentials,
      senderId: input.senderId ?? null,
      timeoutMs: input.timeoutMs,
      retryCount: input.retryCount,
    });
    return this.toResponse(await this.repository.create(input, actorUserId, correlationId));
  }

  async patch(id: string, input: PatchSmsConfigurationInput, actorUserId: string, correlationId?: string) {
    return this.toResponse(await this.repository.patchDraft(id, input, actorUserId, correlationId));
  }

  async createRevision(id: string, input: CreateSmsRevisionInput, actorUserId: string, correlationId?: string) {
    const source = await this.requireRecord(id);
    const credentials = input.credentials ?? this.repository.decryptCredentials(source);
    this.validateProviderInput(source.providerKey, {
      apiUrl: input.apiUrl === undefined ? source.apiUrl : input.apiUrl,
      credentials,
      senderId: input.senderId === undefined ? source.senderId : input.senderId,
      timeoutMs: input.timeoutMs ?? source.timeoutMs,
      retryCount: input.retryCount ?? source.retryCount,
    });
    return this.toResponse(await this.repository.createRevision(id, input, actorUserId, correlationId));
  }

  async test(id: string, destination: string, actorUserId: string, correlationId?: string) {
    const record = await this.requireRecord(id);
    this.validateRecord(record);
    await this.audits.appendAuditLog({
      actorType: 'admin',
      actorId: actorUserId,
      action: 'sms_configuration.test_requested',
      targetType: 'sms_provider_configuration',
      targetId: id,
      correlationId,
      metadata: { providerKey: record.providerKey, revision: record.revision },
    });
    const startedAt = Date.now();
    const result = await this.dispatcher.sendConfiguredTest({
      record,
      destination,
      message: 'Public Parks SMS configuration test. No action is required.',
      idempotencyKey: `sms-test:${id}:${record.revision}:${randomUUID()}`,
    });
    await this.repository.recordTest({
      configuration: record,
      actorUserId,
      destinationHash: this.secretHash.hashSensitiveLookup(destination),
      destinationMasked: this.maskPhoneNumber(destination),
      successful: result.success,
      errorCode: result.success ? undefined : result.errorCode,
      durationMs: Date.now() - startedAt,
      correlationId,
    });
    return result.success
      ? { successful: true as const }
      : { successful: false as const, errorCode: result.errorCode };
  }

  async activate(id: string, actorUserId: string, correlationId?: string) {
    const record = await this.requireRecord(id);
    this.validateRecord(record);
    if (record.providerKey === 'mock' && !this.mockAllowed) {
      throw new ApplicationException(
        ErrorCode.RESOURCE_CONFLICT,
        'The mock provider cannot be activated in this environment.',
      );
    }
    return this.toResponse(await this.repository.activate(id, actorUserId, correlationId));
  }

  async deactivate(id: string, actorUserId: string, correlationId?: string) {
    return this.toResponse(await this.repository.deactivate(id, actorUserId, correlationId));
  }

  private validateRecord(record: SmsConfigurationRecord): void {
    this.validateProviderInput(record.providerKey, {
      apiUrl: record.apiUrl,
      credentials: this.repository.decryptCredentials(record),
      senderId: record.senderId,
      timeoutMs: record.timeoutMs,
      retryCount: record.retryCount,
    });
  }

  private validateProviderInput(providerKey: string, configuration: SmsProviderConfiguration): void {
    const provider = this.registry.get(providerKey);
    if (!provider) {
      throw new ApplicationException(
        ErrorCode.UNPROCESSABLE_ENTITY,
        'The SMS provider implementation is not registered.',
      );
    }
    const errors = [...provider.validateConfiguration(configuration)];
    if (!provider.isApiHostPermitted(configuration.apiUrl)) {
      errors.push('The API host is not permitted by this provider implementation.');
    }
    if (errors.length > 0) {
      throw new ApplicationException(
        ErrorCode.UNPROCESSABLE_ENTITY,
        'The SMS provider configuration is invalid.',
        { details: { errors } },
      );
    }
  }

  private toResponse(record: SmsConfigurationRecord) {
    const provider = this.registry.get(record.providerKey);
    const credentials = this.repository.decryptCredentials(record);
    return {
      id: record.id,
      scopeType: record.scopeType,
      scopeId: record.scopeId,
      providerKey: record.providerKey,
      displayName: record.displayName,
      apiUrl: record.apiUrl,
      senderId: record.senderId,
      timeoutMs: record.timeoutMs,
      retryCount: record.retryCount,
      isEnabled: record.isEnabled,
      isActive: record.isActive,
      revision: record.revision,
      lastSuccessfulTestRevision: record.lastSuccessfulTestRevision,
      activatedAt: record.activatedAt?.toISOString() ?? null,
      deactivatedAt: record.deactivatedAt?.toISOString() ?? null,
      credentialsConfigured: this.credentialIndicators(provider, credentials),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private credentialIndicators(
    provider: SmsProvider | undefined,
    credentials: Readonly<Record<string, string>>,
  ): Readonly<Record<string, boolean>> {
    const keys = provider?.credentialFields.map((field) => field.key) ?? Object.keys(credentials);
    return Object.fromEntries(keys.map((key) => [key, Boolean(credentials[key])]));
  }

  private async requireRecord(id: string): Promise<SmsConfigurationRecord> {
    const record = await this.repository.getById(id);
    if (!record || record.scopeType !== 'platform' || record.scopeId !== null) {
      throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, 'SMS configuration not found.');
    }
    return record;
  }

  private maskPhoneNumber(phoneNumber: string): string {
    return `${phoneNumber.slice(0, 4)}***${phoneNumber.slice(-3)}`;
  }

  private get mockAllowed(): boolean {
    return this.appConfig.isDevelopment || this.appConfig.isTest;
  }
}

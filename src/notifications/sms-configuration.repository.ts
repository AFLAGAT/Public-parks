import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool, type PoolClient } from 'pg';
import { ApplicationException } from '../common/errors/application.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { FieldEncryptionService } from '../common/security/field-encryption.service';
import { DRIZZLE_POOL } from '../database/drizzle.module';
import type { EncryptedFieldPayload } from '../database/drizzle.schema';
import type {
  CreateSmsConfigurationInput,
  CreateSmsRevisionInput,
  PatchSmsConfigurationInput,
  SmsConfigurationRecord,
} from './sms-configuration.types';

interface SmsConfigurationRow {
  id: string;
  scope_type: 'platform' | 'city';
  scope_id: string | null;
  provider_key: string;
  display_name: string;
  api_url: string | null;
  encrypted_credentials: EncryptedFieldPayload;
  sender_id: string | null;
  timeout_ms: number;
  retry_count: number;
  is_enabled: boolean;
  is_active: boolean;
  revision: number;
  last_successful_test_revision: number | null;
  activated_at: Date | null;
  deactivated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class SmsConfigurationRepository {
  constructor(
    @Inject(DRIZZLE_POOL) private readonly pool: Pool,
    @Inject(FieldEncryptionService)
    private readonly encryption: FieldEncryptionService,
  ) {}

  async listPlatform(): Promise<readonly SmsConfigurationRecord[]> {
    const result = await this.pool.query<SmsConfigurationRow>(
      `${this.selectColumns()}
       WHERE scope_type = 'platform' AND scope_id IS NULL
       ORDER BY provider_key, revision DESC`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async getById(id: string, client: Pool | PoolClient = this.pool): Promise<SmsConfigurationRecord | null> {
    const result = await client.query<SmsConfigurationRow>(
      `${this.selectColumns()} WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async resolvePlatformActive(): Promise<SmsConfigurationRecord | null> {
    const result = await this.pool.query<SmsConfigurationRow>(
      `${this.selectColumns()}
       WHERE scope_type = 'platform' AND scope_id IS NULL
         AND is_active = true AND is_enabled = true
       LIMIT 1`,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async create(
    input: CreateSmsConfigurationInput,
    actorUserId: string,
    correlationId?: string,
  ): Promise<SmsConfigurationRecord> {
    const id = randomUUID();
    const encryptedCredentials = this.encryption.encryptJson(
      input.credentials,
      this.credentialsAad(id, 1),
    );
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<SmsConfigurationRow>(
        `INSERT INTO sms_provider_configurations
          (id, scope_type, scope_id, provider_key, display_name, api_url,
           encrypted_credentials, sender_id, timeout_ms, retry_count, is_enabled,
           created_by_user_id, updated_by_user_id)
         VALUES ($1, 'platform', NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
         RETURNING *`,
        [
          id,
          input.providerKey,
          input.displayName,
          input.apiUrl ?? null,
          encryptedCredentials,
          input.senderId ?? null,
          input.timeoutMs,
          input.retryCount,
          input.isEnabled,
          actorUserId,
        ],
      );
      await this.appendAudit(client, actorUserId, 'sms_configuration.created', id, {
        providerKey: input.providerKey,
        revision: 1,
        scopeType: 'platform',
      }, correlationId);
      await client.query('COMMIT');
      return this.mapRow(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async patchDraft(
    id: string,
    input: PatchSmsConfigurationInput,
    actorUserId: string,
    correlationId?: string,
  ): Promise<SmsConfigurationRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.requireById(id, client, true);
      if (current.activatedAt !== null) {
        throw new ApplicationException(
          ErrorCode.RESOURCE_CONFLICT,
          'Active configurations are immutable; create a revision.',
        );
      }
      const result = await client.query<SmsConfigurationRow>(
        `UPDATE sms_provider_configurations
            SET display_name = COALESCE($2, display_name),
                is_enabled = COALESCE($3, is_enabled),
                updated_by_user_id = $4, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [id, input.displayName ?? null, input.isEnabled ?? null, actorUserId],
      );
      await this.appendAudit(client, actorUserId, 'sms_configuration.updated', id, {
        providerKey: current.providerKey,
        revision: current.revision,
      }, correlationId);
      await client.query('COMMIT');
      return this.mapRow(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createRevision(
    sourceId: string,
    input: CreateSmsRevisionInput,
    actorUserId: string,
    correlationId?: string,
  ): Promise<SmsConfigurationRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const source = await this.requireById(sourceId, client, true);
      const nextResult = await client.query<{ revision: number }>(
        `SELECT COALESCE(max(revision), 0) + 1 AS revision
           FROM sms_provider_configurations
          WHERE scope_type = $1 AND scope_id IS NOT DISTINCT FROM $2
            AND provider_key = $3`,
        [source.scopeType, source.scopeId, source.providerKey],
      );
      const revision = Number(nextResult.rows[0]?.revision ?? source.revision + 1);
      const id = randomUUID();
      const credentials = input.credentials ?? this.decryptCredentials(source);
      const encryptedCredentials = this.encryption.encryptJson(
        credentials,
        this.credentialsAad(id, revision),
      );
      const result = await client.query<SmsConfigurationRow>(
        `INSERT INTO sms_provider_configurations
          (id, scope_type, scope_id, provider_key, display_name, api_url,
           encrypted_credentials, sender_id, timeout_ms, retry_count, is_enabled,
           revision, created_by_user_id, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
         RETURNING *`,
        [
          id,
          source.scopeType,
          source.scopeId,
          source.providerKey,
          input.displayName ?? source.displayName,
          input.apiUrl === undefined ? source.apiUrl : input.apiUrl,
          encryptedCredentials,
          input.senderId === undefined ? source.senderId : input.senderId,
          input.timeoutMs ?? source.timeoutMs,
          input.retryCount ?? source.retryCount,
          input.isEnabled ?? source.isEnabled,
          revision,
          actorUserId,
        ],
      );
      await this.appendAudit(client, actorUserId, 'sms_configuration.revision_created', id, {
        providerKey: source.providerKey,
        revision,
        sourceConfigurationId: sourceId,
      }, correlationId);
      await client.query('COMMIT');
      return this.mapRow(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordTest(input: {
    readonly configuration: SmsConfigurationRecord;
    readonly actorUserId: string;
    readonly destinationHash: string;
    readonly destinationMasked: string;
    readonly successful: boolean;
    readonly errorCode?: string;
    readonly durationMs: number;
    readonly correlationId?: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO sms_provider_tests
          (sms_provider_configuration_id, configuration_revision, destination_hash,
           destination_masked, is_successful, error_code, duration_ms, actor_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.configuration.id,
          input.configuration.revision,
          input.destinationHash,
          input.destinationMasked,
          input.successful,
          input.errorCode ?? null,
          input.durationMs,
          input.actorUserId,
        ],
      );
      if (input.successful) {
        await client.query(
          `UPDATE sms_provider_configurations
              SET last_successful_test_revision = revision, updated_at = now(),
                  updated_by_user_id = $2
            WHERE id = $1`,
          [input.configuration.id, input.actorUserId],
        );
      }
      await this.appendAudit(
        client,
        input.actorUserId,
        input.successful ? 'sms_configuration.test_succeeded' : 'sms_configuration.test_failed',
        input.configuration.id,
        {
          providerKey: input.configuration.providerKey,
          revision: input.configuration.revision,
          errorCode: input.errorCode ?? null,
        },
        input.correlationId,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async activate(
    id: string,
    actorUserId: string,
    correlationId?: string,
  ): Promise<SmsConfigurationRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const target = await this.requireById(id, client, true);
      if (!target.isEnabled || target.lastSuccessfulTestRevision !== target.revision) {
        throw new ApplicationException(
          ErrorCode.RESOURCE_CONFLICT,
          'The enabled revision must pass a test before activation.',
        );
      }
      await client.query(
        `UPDATE sms_provider_configurations
            SET is_active = false, deactivated_at = now(), updated_at = now(), updated_by_user_id = $3
          WHERE scope_type = $1 AND scope_id IS NOT DISTINCT FROM $2 AND is_active = true`,
        [target.scopeType, target.scopeId, actorUserId],
      );
      const result = await client.query<SmsConfigurationRow>(
        `UPDATE sms_provider_configurations
            SET is_active = true, activated_at = COALESCE(activated_at, now()),
                deactivated_at = NULL, updated_at = now(), updated_by_user_id = $2
          WHERE id = $1 RETURNING *`,
        [id, actorUserId],
      );
      await this.appendAudit(client, actorUserId, 'sms_configuration.activated', id, {
        providerKey: target.providerKey,
        revision: target.revision,
        scopeType: target.scopeType,
      }, correlationId);
      await client.query('COMMIT');
      return this.mapRow(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deactivate(
    id: string,
    actorUserId: string,
    correlationId?: string,
  ): Promise<SmsConfigurationRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const target = await this.requireById(id, client, true);
      const result = await client.query<SmsConfigurationRow>(
        `UPDATE sms_provider_configurations
            SET is_active = false, deactivated_at = now(), updated_at = now(), updated_by_user_id = $2
          WHERE id = $1 RETURNING *`,
        [id, actorUserId],
      );
      await this.appendAudit(client, actorUserId, 'sms_configuration.deactivated', id, {
        providerKey: target.providerKey,
        revision: target.revision,
      }, correlationId);
      await client.query('COMMIT');
      return this.mapRow(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async insertDeliveryAttempt(input: {
    readonly configuration: SmsConfigurationRecord;
    readonly purpose: string;
    readonly destinationHash: string;
    readonly successful: boolean;
    readonly providerMessageId?: string;
    readonly errorCode?: string;
    readonly attemptNumber: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO sms_delivery_attempts
        (sms_provider_configuration_id, provider_key, purpose, destination_hash,
         delivery_status, provider_message_id, error_code, attempt_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.configuration.id,
        input.configuration.providerKey,
        input.purpose,
        input.destinationHash,
        input.successful ? 'sent' : 'failed',
        input.providerMessageId ?? null,
        input.errorCode ?? null,
        input.attemptNumber,
      ],
    );
  }

  decryptCredentials(record: SmsConfigurationRecord): Readonly<Record<string, string>> {
    return this.encryption.decryptJson<Record<string, string>>(
      record.encryptedCredentials,
      this.credentialsAad(record.id, record.revision),
    );
  }

  private async requireById(
    id: string,
    client: PoolClient,
    lock: boolean,
  ): Promise<SmsConfigurationRecord> {
    const result = await client.query<SmsConfigurationRow>(
      `${this.selectColumns()} WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, 'SMS configuration not found.');
    }
    return this.mapRow(row);
  }

  private async appendAudit(
    client: PoolClient,
    actorUserId: string,
    action: string,
    targetId: string,
    metadata: Readonly<Record<string, unknown>>,
    correlationId?: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs
        (actor_type, actor_id, action, target_type, target_id, metadata, correlation_id)
       VALUES ('admin', $1, $2, 'sms_provider_configuration', $3, $4, $5)`,
      [actorUserId, action, targetId, metadata, correlationId ?? null],
    );
  }

  private credentialsAad(id: string, revision: number): string {
    return `sms-provider-configuration:${id}:revision:${revision}`;
  }

  private selectColumns(): string {
    return `SELECT id, scope_type, scope_id, provider_key, display_name, api_url,
                   encrypted_credentials, sender_id, timeout_ms, retry_count,
                   is_enabled, is_active, revision, last_successful_test_revision,
                   activated_at, deactivated_at, created_at, updated_at
              FROM sms_provider_configurations`;
  }

  private mapRow(row: SmsConfigurationRow): SmsConfigurationRecord {
    return {
      id: row.id,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      providerKey: row.provider_key,
      displayName: row.display_name,
      apiUrl: row.api_url,
      encryptedCredentials: row.encrypted_credentials,
      senderId: row.sender_id,
      timeoutMs: row.timeout_ms,
      retryCount: row.retry_count,
      isEnabled: row.is_enabled,
      isActive: row.is_active,
      revision: row.revision,
      lastSuccessfulTestRevision: row.last_successful_test_revision,
      activatedAt: row.activated_at,
      deactivatedAt: row.deactivated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

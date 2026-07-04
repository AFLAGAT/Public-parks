import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';

interface PostgreSqlError extends Error {
  readonly code: string;
  readonly constraint?: string;
}

async function rejected(operation: Promise<unknown>): Promise<PostgreSqlError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof Error && 'code' in error) return error as PostgreSqlError;
    throw error;
  }
  throw new Error('Expected PostgreSQL to reject the operation.');
}

describe('authentication, SMS, and audit schema integration', () => {
  let pool: Pool;
  let actorId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DB_PRIMARY_URL, max: 2 });
    actorId = randomUUID();
    await pool.query(`INSERT INTO users (id, email) VALUES ($1, $2)`, [
      actorId,
      `sms-admin-${actorId}@example.com`,
    ]);
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM sms_provider_configurations
        WHERE created_by_user_id = $1 OR updated_by_user_id = $1`,
      [actorId],
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [actorId]);
    await pool.end();
  });

  it('seeds Super Admin SMS-management RBAC', async () => {
    const result = await pool.query(
      `SELECT r.code AS role_code, p.code AS permission_code
         FROM roles r
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.code = 'super_admin'`,
    );
    expect(result.rows).toContainEqual({
      role_code: 'super_admin',
      permission_code: 'sms_provider_configurations.manage',
    });
  });

  it('enforces one active provider for the platform scope', async () => {
    const encrypted = {
      keyId: 'test-v1',
      iv: 'not-plaintext',
      ciphertext: 'ciphertext-only',
      authTag: 'authenticated',
    };
    await pool.query(
      `INSERT INTO sms_provider_configurations
        (provider_key, display_name, encrypted_credentials, is_enabled, is_active,
         created_by_user_id, updated_by_user_id)
       VALUES ('mock', 'Mock one', $1, true, true, $2, $2)`,
      [encrypted, actorId],
    );
    const error = await rejected(
      pool.query(
        `INSERT INTO sms_provider_configurations
          (provider_key, display_name, encrypted_credentials, is_enabled, is_active,
           created_by_user_id, updated_by_user_id)
         VALUES ('future', 'Future provider', $1, true, true, $2, $2)`,
        [encrypted, actorId],
      ),
    );
    expect(error.code).toBe('23505');
    expect(error.constraint).toBe('uidx_sms_provider_configurations__active_scope');
  });

  it('rejects city-scoped rows without a city identifier', async () => {
    const error = await rejected(
      pool.query(
        `INSERT INTO sms_provider_configurations
          (scope_type, scope_id, provider_key, display_name, encrypted_credentials,
           created_by_user_id, updated_by_user_id)
         VALUES ('city', NULL, 'mock', 'Invalid city row', $1, $2, $2)`,
        [{ keyId: 'x', iv: 'x', ciphertext: 'x', authTag: 'x' }, actorId],
      ),
    );
    expect(error.code).toBe('23514');
    expect(error.constraint).toBe('chk_sms_provider_configurations__scope_shape');
  });

  it('makes audit records immutable to updates, deletes, and truncation', async () => {
    const result = await pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO audit_logs (actor_type, actor_id, action, target_type, metadata)
       VALUES ('admin', $1, 'test.audit', 'test_target', '{}')
       RETURNING id, created_at`,
      [actorId],
    );
    const row = result.rows[0];
    expect(row).toBeDefined();
    await expect(
      pool.query(`UPDATE audit_logs SET action = 'tampered' WHERE id = $1`, [row?.id]),
    ).rejects.toThrow('audit_logs are immutable');
    await expect(
      pool.query(`DELETE FROM audit_logs WHERE id = $1`, [row?.id]),
    ).rejects.toThrow('audit_logs are immutable');
    await expect(pool.query(`TRUNCATE audit_logs`)).rejects.toThrow(
      'audit_logs are immutable',
    );
  });
});

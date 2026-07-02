import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { users } from './drizzle.schema';

describe('users schema', () => {
  const tableConfig = getTableConfig(users);
  const columnNames = tableConfig.columns.map((column) => column.name);

  it('uses the canonical table, key, index, and constraint names', () => {
    expect(tableConfig.name).toBe('users');
    expect(tableConfig.primaryKeys.map((key) => key.getName())).toEqual(['pk_users']);
    expect(tableConfig.indexes.map((index) => index.config.name).sort()).toEqual([
      'uidx_users__email',
      'uidx_users__phone_number',
    ]);
    expect(tableConfig.checks.map((constraint) => constraint.name).sort()).toEqual([
      'chk_users__email_normalized',
      'chk_users__email_verification_has_email',
      'chk_users__identity_channel_present',
      'chk_users__phone_number_e164',
      'chk_users__phone_verification_has_phone_number',
    ]);
  });

  it('contains identity and lifecycle fields without embedding client or role state', () => {
    expect(columnNames).toEqual([
      'id',
      'phone_number',
      'email',
      'phone_number_verified_at',
      'email_verified_at',
      'is_active',
      'created_at',
      'updated_at',
    ]);
    expect(columnNames).not.toContain('role');
    expect(columnNames).not.toContain('client_type');
  });

  it('does not create plaintext credential or recovery-token storage', () => {
    expect(columnNames).not.toContain('password');
    expect(columnNames).not.toContain('otp');
    expect(columnNames).not.toContain('reset_token');
  });
});

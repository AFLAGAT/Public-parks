import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { qrCodes } from './drizzle.schema';

describe('qr_codes schema', () => {
  const tableConfig = getTableConfig(qrCodes);
  const columnNames = tableConfig.columns.map((column) => column.name);

  it('uses the canonical table, key, index, and constraint names', () => {
    expect(tableConfig.name).toBe('qr_codes');
    expect(tableConfig.primaryKeys.map((key) => key.getName())).toEqual([
      'pk_qr_codes',
    ]);
    expect(tableConfig.indexes.map((index) => index.config.name).sort()).toEqual([
      'uidx_qr_codes__scannable__where_active',
    ]);
    expect(tableConfig.checks.map((constraint) => constraint.name).sort()).toEqual([
      'chk_qr_codes__revocation_consistency',
    ]);
  });

  it('references a booking through the polymorphic scannable pair without a stored secret', () => {
    expect(columnNames).toEqual([
      'id',
      'scannable_type',
      'scannable_id',
      'qr_code_status',
      'revoked_at',
      'created_at',
      'updated_at',
    ]);
    // The signed token carries only `id`; no reusable QR secret is persisted.
    expect(columnNames).not.toContain('secret');
    expect(columnNames).not.toContain('token');
    expect(columnNames).not.toContain('token_hash');
    // Consumption/replay state lives in check_ins, never as a boolean here.
    expect(columnNames).not.toContain('used');
    expect(columnNames).not.toContain('used_at');
    expect(columnNames).not.toContain('consumed_at');
  });

  it('has no foreign key, by design, because the scannable reference is polymorphic', () => {
    expect(tableConfig.foreignKeys).toHaveLength(0);
  });

  it('enforces one active credential per booking through a partial unique index', () => {
    const activeUniqueIndex = tableConfig.indexes.find(
      (index) => index.config.name === 'uidx_qr_codes__scannable__where_active',
    );
    expect(activeUniqueIndex?.config.unique).toBe(true);
    expect(activeUniqueIndex?.config.where).toBeDefined();
  });
});

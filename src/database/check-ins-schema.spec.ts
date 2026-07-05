import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { checkIns } from './drizzle.schema';

describe('check_ins schema', () => {
  const tableConfig = getTableConfig(checkIns);
  const columnNames = tableConfig.columns.map((column) => column.name);

  it('uses the canonical table, key, index, and constraint names', () => {
    expect(tableConfig.name).toBe('check_ins');
    expect(tableConfig.primaryKeys.map((key) => key.getName())).toEqual([
      'pk_check_ins',
    ]);
    expect(tableConfig.indexes.map((index) => index.config.name).sort()).toEqual([
      'idx_check_ins__facility_id_scan_minute',
      'idx_check_ins__qr_code_id',
      'uidx_check_ins__idempotency',
    ]);
    expect(tableConfig.foreignKeys.map((fk) => fk.getName()).sort()).toEqual([
      'fk_check_ins__facility_id__facilities',
      'fk_check_ins__qr_code_id__qr_codes',
      'fk_check_ins__staff_user_id__users',
    ]);
    expect(tableConfig.checks.map((constraint) => constraint.name).sort()).toEqual([
      'chk_check_ins__rejection_reason_consistency',
      'chk_check_ins__scan_minute_truncated',
    ]);
  });

  it('records scan actor, device, facility scope, source, result, and sync reference', () => {
    expect(columnNames).toEqual([
      'id',
      'qr_code_id',
      'staff_user_id',
      'facility_id',
      'device_id',
      'validation_source',
      'check_in_result',
      'rejection_reason',
      'scanned_at',
      'scan_minute',
      'sync_batch_id',
      'correlation_id',
      'created_at',
      'updated_at',
    ]);
  });

  it('includes the partition key in the primary key and the idempotency key', () => {
    // Postgres requires unique/primary keys on a partitioned table to contain
    // the partition column (scan_minute); this is also what makes the
    // idempotency key globally enforceable.
    const primaryKey = tableConfig.primaryKeys[0];
    expect(primaryKey?.columns.map((column) => column.name)).toEqual([
      'id',
      'scan_minute',
    ]);

    const idempotencyIndex = tableConfig.indexes.find(
      (index) => index.config.name === 'uidx_check_ins__idempotency',
    );
    expect(idempotencyIndex?.config.unique).toBe(true);
    expect(
      idempotencyIndex?.config.columns.map((column) =>
        'name' in column ? column.name : undefined,
      ),
    ).toEqual(['device_id', 'qr_code_id', 'scan_minute']);
  });
});

import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { staffAssignments } from './drizzle.schema';

describe('staff_assignments schema', () => {
  const tableConfig = getTableConfig(staffAssignments);
  const columnNames = tableConfig.columns.map((column) => column.name);

  it('uses the canonical table, key, index, and constraint names', () => {
    expect(tableConfig.name).toBe('staff_assignments');
    expect(tableConfig.primaryKeys.map((key) => key.getName())).toEqual([
      'pk_staff_assignments',
    ]);
    expect(tableConfig.indexes.map((index) => index.config.name).sort()).toEqual([
      'idx_staff_assignments__facility_id_assignment_status',
      'idx_staff_assignments__user_id_assignment_status',
      'uidx_staff_assignments__user_facility__where_active',
    ]);
    expect(tableConfig.foreignKeys.map((fk) => fk.getName()).sort()).toEqual([
      'fk_staff_assignments__assigned_by_user_id__users',
      'fk_staff_assignments__facility_id__facilities',
      'fk_staff_assignments__revoked_by_user_id__users',
      'fk_staff_assignments__user_id__users',
    ]);
    expect(tableConfig.checks.map((constraint) => constraint.name).sort()).toEqual([
      'chk_staff_assignments__revocation_consistency',
      'chk_staff_assignments__time_range',
    ]);
  });

  it('scopes a staff member to a facility across an explicit time range', () => {
    expect(columnNames).toEqual([
      'id',
      'user_id',
      'facility_id',
      'assigned_by_user_id',
      'assignment_status',
      'starts_at',
      'ends_at',
      'revoked_at',
      'revoked_by_user_id',
      'created_at',
      'updated_at',
    ]);
  });

  it('enforces active-assignment uniqueness through a partial index', () => {
    const activeUniqueIndex = tableConfig.indexes.find(
      (index) =>
        index.config.name === 'uidx_staff_assignments__user_facility__where_active',
    );
    expect(activeUniqueIndex?.config.unique).toBe(true);
    expect(activeUniqueIndex?.config.where).toBeDefined();
  });
});

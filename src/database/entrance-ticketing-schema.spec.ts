import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { entranceTickets, facilityCapacities } from './drizzle.schema';

describe('facility_capacities schema', () => {
  const tableConfig = getTableConfig(facilityCapacities);
  const columnNames = tableConfig.columns.map((column) => column.name);

  it('uses the canonical table, key, constraint, and unique names', () => {
    expect(tableConfig.name).toBe('facility_capacities');
    expect(tableConfig.primaryKeys.map((key) => key.getName())).toEqual([
      'pk_facility_capacities',
    ]);
    expect(tableConfig.foreignKeys.map((fk) => fk.getName())).toEqual([
      'fk_facility_capacities__facility_id__facilities',
    ]);
    expect(tableConfig.checks.map((constraint) => constraint.name).sort()).toEqual([
      'chk_facility_capacities__max_capacity_nonnegative',
      'chk_facility_capacities__sold_count_bounds',
    ]);
  });

  it('makes (facility_id, service_date) a unique CONSTRAINT so the ticket FK can reference it', () => {
    // A bare unique index is not accepted as a foreign-key target in Postgres.
    expect(tableConfig.uniqueConstraints.map((u) => u.name)).toEqual([
      'uq_facility_capacities__facility_id_service_date',
    ]);
  });

  it('tracks one capacity counter per facility and service date', () => {
    expect(columnNames).toEqual([
      'id',
      'facility_id',
      'service_date',
      'max_capacity',
      'sold_count',
      'created_at',
      'updated_at',
    ]);
  });
});

describe('entrance_tickets schema', () => {
  const tableConfig = getTableConfig(entranceTickets);
  const columnNames = tableConfig.columns.map((column) => column.name);

  it('uses the canonical table, key, index, and constraint names', () => {
    expect(tableConfig.name).toBe('entrance_tickets');
    expect(tableConfig.primaryKeys.map((key) => key.getName())).toEqual([
      'pk_entrance_tickets',
    ]);
    expect(tableConfig.indexes.map((index) => index.config.name).sort()).toEqual([
      'idx_entrance_tickets__buyer_user_id_visit_date',
      'idx_entrance_tickets__facility_id_visit_date_status',
    ]);
    expect(tableConfig.foreignKeys.map((fk) => fk.getName()).sort()).toEqual([
      'fk_entrance_tickets__buyer_user_id__users',
      'fk_entrance_tickets__facility_id__facilities',
      'fk_entrance_tickets__facility_service_date__facility_capacities',
    ]);
    expect(tableConfig.checks.map((constraint) => constraint.name).sort()).toEqual([
      'chk_entrance_tickets__quantity_positive',
      'chk_entrance_tickets__total_matches_quantity',
      'chk_entrance_tickets__unit_price_nonnegative',
      'chk_entrance_tickets__used_quantity_bounds',
    ]);
  });

  it('carries date, quantity, status, buyer, price snapshots, and used-quantity', () => {
    expect(columnNames).toEqual([
      'id',
      'facility_id',
      'buyer_user_id',
      'visit_date',
      'quantity',
      'used_quantity',
      'entrance_ticket_status',
      'unit_price_at_booking',
      'total_amount_at_booking',
      'confirmed_at',
      'created_at',
      'updated_at',
    ]);
  });

  it('references the buyer and capacity through a composite date-scoped foreign key', () => {
    const compositeFk = tableConfig.foreignKeys.find(
      (fk) =>
        fk.getName() ===
        'fk_entrance_tickets__facility_service_date__facility_capacities',
    );
    expect(compositeFk?.reference().columns.map((column) => column.name)).toEqual([
      'facility_id',
      'visit_date',
    ]);
  });
});

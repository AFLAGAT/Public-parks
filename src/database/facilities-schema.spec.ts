import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  facilities,
  facilityOperationalClassification,
  facilityTypes,
} from './drizzle.schema';

describe('facilities schema', () => {
  const facilityTypesConfig = getTableConfig(facilityTypes);
  const facilitiesConfig = getTableConfig(facilities);

  it('defines the exact operational classifications', () => {
    expect(facilityOperationalClassification.enumValues).toEqual([
      'slot_based',
      'entrance_based',
    ]);
  });

  it('uses canonical keys, indexes, and constraints for facility types', () => {
    expect(facilityTypesConfig.primaryKeys.map((key) => key.getName())).toEqual([
      'pk_facility_types',
    ]);
    expect(facilityTypesConfig.indexes.map((indexValue) => indexValue.config.name)).toEqual([
      'uidx_facility_types__code',
    ]);
    expect(facilityTypesConfig.checks.map((constraint) => constraint.name).sort()).toEqual([
      'chk_facility_types__code_normalized',
      'chk_facility_types__name_normalized',
    ]);
  });

  it('uses a named type foreign key and geospatial discovery indexes', () => {
    expect(facilitiesConfig.foreignKeys.map((key) => key.getName())).toEqual([
      'fk_facilities__facility_type_id__facility_types',
    ]);
    expect(
      facilitiesConfig.indexes
        .map((indexValue) => ({ name: indexValue.config.name, method: indexValue.config.method }))
        .sort((left, right) => left.name!.localeCompare(right.name!)),
    ).toEqual([
      { name: 'idx_facilities__facility_type_id', method: 'btree' },
      { name: 'idx_facilities__location_geography', method: 'gist' },
    ]);
    expect(facilitiesConfig.checks.map((constraint) => constraint.name).sort()).toEqual([
      'chk_facilities__address_normalized',
      'chk_facilities__location_bounds',
      'chk_facilities__location_srid',
      'chk_facilities__name_normalized',
    ]);
  });
});

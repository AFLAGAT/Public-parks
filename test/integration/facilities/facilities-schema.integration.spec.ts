import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  facilities,
  facilityTypes,
  schema,
} from '../../../src/database/drizzle.schema';
import { FacilitiesRepository } from '../../../src/facilities/facilities.repository';

interface PostgreSqlError extends Error {
  readonly code: string;
  readonly constraint?: string;
}

function isPostgreSqlError(error: unknown): error is PostgreSqlError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    (!('constraint' in error) ||
      error.constraint === undefined ||
      typeof error.constraint === 'string')
  );
}

async function getRejectedDatabaseError(operation: Promise<unknown>): Promise<PostgreSqlError> {
  try {
    await operation;
  } catch (error) {
    let currentError: unknown = error;
    while (currentError instanceof Error) {
      if (isPostgreSqlError(currentError)) {
        return currentError;
      }
      currentError = currentError.cause;
    }
    throw error;
  }
  throw new Error('Expected the database operation to be rejected.');
}

describe('facilities schema integration', () => {
  const databaseUrl = process.env.DB_PRIMARY_URL;
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;
  let facilitiesRepository: FacilitiesRepository;

  beforeAll(() => {
    if (!databaseUrl) {
      throw new Error('DB_PRIMARY_URL must be set by the integration test runner.');
    }
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    db = drizzle(pool, { schema });
    facilitiesRepository = new FacilitiesRepository(db);
  });

  beforeEach(async () => {
    await db.delete(facilities);
    await db.delete(facilityTypes);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('resolves each facility through one operationally classified type', async () => {
    const [entranceType] = await db
      .insert(facilityTypes)
      .values({
        code: 'public_pool',
        name: 'Public Pool',
        operationalClassification: 'entrance_based',
      })
      .returning();
    const [slotType] = await db
      .insert(facilityTypes)
      .values({
        code: 'tennis',
        name: 'Tennis',
        operationalClassification: 'slot_based',
      })
      .returning();

    await db.insert(facilities).values([
      {
        facilityTypeId: entranceType.id,
        name: 'Arada Public Pool',
        address: 'Arada, Addis Ababa',
        location: { x: 38.7578, y: 9.0301 },
      },
      {
        facilityTypeId: slotType.id,
        name: 'Bole Tennis Center',
        address: 'Bole, Addis Ababa',
        location: { x: 38.789, y: 8.995 },
      },
    ]);

    const rows = await db
      .select({
        name: facilities.name,
        location: facilities.location,
        operationalClassification: facilityTypes.operationalClassification,
      })
      .from(facilities)
      .innerJoin(facilityTypes, eq(facilities.facilityTypeId, facilityTypes.id))
      .orderBy(asc(facilities.name));

    expect(rows).toEqual([
      {
        name: 'Arada Public Pool',
        location: { x: 38.7578, y: 9.0301 },
        operationalClassification: 'entrance_based',
      },
      {
        name: 'Bole Tennis Center',
        location: { x: 38.789, y: 8.995 },
        operationalClassification: 'slot_based',
      },
    ]);
  });

  it('supports meter-based nearby discovery through the geography index expression', async () => {
    const [parkType] = await db
      .insert(facilityTypes)
      .values({
        code: 'public_park',
        name: 'Public Park',
        operationalClassification: 'entrance_based',
      })
      .returning();

    await db.insert(facilities).values([
      {
        facilityTypeId: parkType.id,
        name: 'Nearby Park',
        address: 'Central Addis Ababa',
        location: { x: 38.7578, y: 9.0301 },
      },
      {
        facilityTypeId: parkType.id,
        name: 'Distant Park',
        address: 'Northern Addis Ababa',
        location: { x: 38.764, y: 9.1 },
      },
    ]);

    const nearbyResult = await pool.query(
      `SELECT name
         FROM facilities
        WHERE ST_DWithin(
          location::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
        ORDER BY name`,
      [38.7578, 9.0301, 2_000],
    );
    expect(nearbyResult.rows).toEqual([{ name: 'Nearby Park' }]);

    const indexResult = await pool.query(
      `SELECT indexdef
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_facilities__location_geography'`,
    );
    expect(indexResult.rows).toHaveLength(1);
    const indexDefinition = (indexResult.rows[0] as { indexdef: string }).indexdef.toLowerCase();
    expect(indexDefinition).toContain('using gist');
    expect(indexDefinition).toContain('(location)::geography');
  });

  it('lists only active public records using text and facility-type filters', async () => {
    const [poolType] = await db
      .insert(facilityTypes)
      .values({
        code: 'public_pool',
        name: 'Public Pool',
        operationalClassification: 'entrance_based',
      })
      .returning();
    const [parkType] = await db
      .insert(facilityTypes)
      .values({
        code: 'public_park',
        name: 'Public Park',
        operationalClassification: 'entrance_based',
      })
      .returning();

    await db.insert(facilities).values([
      {
        facilityTypeId: poolType.id,
        name: 'Arada Family Pool',
        description: 'Indoor swimming facility',
        address: 'Arada, Addis Ababa',
        location: { x: 38.7578, y: 9.0301 },
      },
      {
        facilityTypeId: poolType.id,
        name: 'Closed Pool',
        address: 'Bole, Addis Ababa',
        location: { x: 38.78, y: 9.01 },
        isActive: false,
      },
      {
        facilityTypeId: parkType.id,
        name: 'Arada Public Park',
        address: 'Arada, Addis Ababa',
        location: { x: 38.76, y: 9.03 },
      },
    ]);

    const rows = await facilitiesRepository.listFacilities({
      pageSize: 10,
      search: 'arada',
      facilityType: 'public_pool',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Arada Family Pool',
      facilityTypeCode: 'public_pool',
      operationalClassification: 'entrance_based',
      distanceMeters: null,
    });
  });

  it('uses distance ordering, radius bounds, and exact keyset continuation', async () => {
    const [parkType] = await db
      .insert(facilityTypes)
      .values({
        code: 'public_park',
        name: 'Public Park',
        operationalClassification: 'entrance_based',
      })
      .returning();
    await db.insert(facilities).values([
      {
        facilityTypeId: parkType.id,
        name: 'At Search Point',
        address: 'Central Addis Ababa',
        location: { x: 38.7578, y: 9.0301 },
      },
      {
        facilityTypeId: parkType.id,
        name: 'A Short Walk Away',
        address: 'Central Addis Ababa',
        location: { x: 38.7588, y: 9.0301 },
      },
      {
        facilityTypeId: parkType.id,
        name: 'Outside Radius',
        address: 'Northern Addis Ababa',
        location: { x: 38.764, y: 9.1 },
      },
    ]);

    const firstRows = await facilitiesRepository.listFacilities({
      pageSize: 1,
      nearLat: 9.0301,
      nearLng: 38.7578,
      radiusMeters: 2_000,
    });
    expect(firstRows.map((row) => row.name)).toEqual([
      'At Search Point',
      'A Short Walk Away',
    ]);
    expect(firstRows[0]?.distanceMeters).toBeCloseTo(0, 5);
    expect(firstRows[1]?.distanceMeters).toBeGreaterThan(0);

    const firstRow = firstRows[0];
    if (!firstRow || firstRow.distanceMeters === null) {
      throw new Error('Expected a nearby facility row with a distance.');
    }
    const nextRows = await facilitiesRepository.listFacilities({
      pageSize: 10,
      nearLat: 9.0301,
      nearLng: 38.7578,
      radiusMeters: 2_000,
      decodedCursor: {
        mode: 'nearby',
        id: firstRow.id,
        distanceMeters: firstRow.distanceMeters,
        queryKey: 'integration-test',
      },
    });
    expect(nextRows.map((row) => row.name)).toEqual(['A Short Walk Away']);
  });

  it('returns only active facility details with an active public type', async () => {
    const [activeType] = await db
      .insert(facilityTypes)
      .values({
        code: 'public_park',
        name: 'Public Park',
        operationalClassification: 'entrance_based',
      })
      .returning();
    const [inactiveType] = await db
      .insert(facilityTypes)
      .values({
        code: 'retired_pool',
        name: 'Retired Pool',
        operationalClassification: 'entrance_based',
        isActive: false,
      })
      .returning();
    const [activeFacility, inactiveFacility, inactiveTypeFacility] = await db
      .insert(facilities)
      .values([
        {
          facilityTypeId: activeType.id,
          name: 'Visible Park',
          address: 'Addis Ababa',
          location: { x: 38.7578, y: 9.0301 },
        },
        {
          facilityTypeId: activeType.id,
          name: 'Hidden Park',
          address: 'Addis Ababa',
          location: { x: 38.76, y: 9.03 },
          isActive: false,
        },
        {
          facilityTypeId: inactiveType.id,
          name: 'Retired Pool Facility',
          address: 'Addis Ababa',
          location: { x: 38.77, y: 9.02 },
        },
      ])
      .returning();

    await expect(
      facilitiesRepository.getFacility(activeFacility.id),
    ).resolves.toMatchObject({ name: 'Visible Park' });
    await expect(
      facilitiesRepository.getFacility(inactiveFacility.id),
    ).resolves.toBeNull();
    await expect(
      facilitiesRepository.getFacility(inactiveTypeFacility.id),
    ).resolves.toBeNull();
  });

  it('rejects an operational classification outside the two-model contract', async () => {
    const error = await getRejectedDatabaseError(
      pool.query(
        `INSERT INTO facility_types (code, name, operational_classification)
         VALUES ($1, $2, $3)`,
        ['hybrid', 'Hybrid', 'hybrid'],
      ),
    );

    expect(error.code).toBe('22P02');
  });

  it('rejects duplicate and non-normalized facility type codes', async () => {
    await db.insert(facilityTypes).values({
      code: 'public_pool',
      name: 'Public Pool',
      operationalClassification: 'entrance_based',
    });

    const duplicateError = await getRejectedDatabaseError(
      db.insert(facilityTypes).values({
        code: 'public_pool',
        name: 'Another Pool Type',
        operationalClassification: 'entrance_based',
      }),
    );
    expect(duplicateError.code).toBe('23505');
    expect(duplicateError.constraint).toBe('uidx_facility_types__code');

    const normalizedError = await getRejectedDatabaseError(
      db.insert(facilityTypes).values({
        code: 'Public Pool',
        name: 'Public Pool',
        operationalClassification: 'entrance_based',
      }),
    );
    expect(normalizedError.code).toBe('23514');
    expect(normalizedError.constraint).toBe('chk_facility_types__code_normalized');
  });

  it('rejects blank public fields and out-of-range coordinates', async () => {
    const [parkType] = await db
      .insert(facilityTypes)
      .values({
        code: 'public_park',
        name: 'Public Park',
        operationalClassification: 'entrance_based',
      })
      .returning();

    const blankNameError = await getRejectedDatabaseError(
      db.insert(facilities).values({
        facilityTypeId: parkType.id,
        name: '  ',
        address: 'Central Addis Ababa',
        location: { x: 38.7578, y: 9.0301 },
      }),
    );
    expect(blankNameError.constraint).toBe('chk_facilities__name_normalized');

    const blankAddressError = await getRejectedDatabaseError(
      db.insert(facilities).values({
        facilityTypeId: parkType.id,
        name: 'Public Park',
        address: '  ',
        location: { x: 38.7578, y: 9.0301 },
      }),
    );
    expect(blankAddressError.constraint).toBe('chk_facilities__address_normalized');

    const locationError = await getRejectedDatabaseError(
      db.insert(facilities).values({
        facilityTypeId: parkType.id,
        name: 'Impossible Park',
        address: 'Outside valid longitude',
        location: { x: 181, y: 9.0301 },
      }),
    );
    expect(locationError.constraint).toBe('chk_facilities__location_bounds');
  });

  it('rejects unknown facility types and protects referenced type records', async () => {
    const unknownTypeError = await getRejectedDatabaseError(
      db.insert(facilities).values({
        facilityTypeId: randomUUID(),
        name: 'Unknown Type Facility',
        address: 'Addis Ababa',
        location: { x: 38.7578, y: 9.0301 },
      }),
    );
    expect(unknownTypeError.code).toBe('23503');
    expect(unknownTypeError.constraint).toBe(
      'fk_facilities__facility_type_id__facility_types',
    );

    const [parkType] = await db
      .insert(facilityTypes)
      .values({
        code: 'public_park',
        name: 'Public Park',
        operationalClassification: 'entrance_based',
      })
      .returning();
    await db.insert(facilities).values({
      facilityTypeId: parkType.id,
      name: 'Referenced Park',
      address: 'Addis Ababa',
      location: { x: 38.7578, y: 9.0301 },
    });

    const deleteError = await getRejectedDatabaseError(
      db.delete(facilityTypes).where(eq(facilityTypes.id, parkType.id)),
    );
    expect(deleteError.code).toBe('23503');
    expect(deleteError.constraint).toBe('fk_facilities__facility_type_id__facility_types');
  });
});

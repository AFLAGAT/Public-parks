import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  facilities,
  facilityTypes,
  schema,
  staffAssignments,
  users,
} from '../../../src/database/drizzle.schema';

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

describe('staff_assignments schema integration', () => {
  const databaseUrl = process.env.DB_PRIMARY_URL;
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;

  let staffUserId: string;
  let otherStaffUserId: string;
  let adminUserId: string;
  let facilityAId: string;
  let facilityBId: string;

  /**
   * Server-side scope predicate under test: a staff member is authorized at a
   * facility only through an active assignment whose window contains `at`.
   * Revocation, out-of-window state, and a different facility must all deny.
   */
  async function findEffectiveAssignmentIds(
    userId: string,
    facilityId: string,
    at: Date,
  ): Promise<string[]> {
    const rows = await db
      .select({ id: staffAssignments.id })
      .from(staffAssignments)
      .where(
        and(
          eq(staffAssignments.userId, userId),
          eq(staffAssignments.facilityId, facilityId),
          eq(staffAssignments.assignmentStatus, 'active'),
          lte(staffAssignments.startsAt, at),
          or(isNull(staffAssignments.endsAt), gt(staffAssignments.endsAt, at)),
        ),
      );
    return rows.map((row) => row.id);
  }

  beforeAll(() => {
    if (!databaseUrl) {
      throw new Error('DB_PRIMARY_URL must be set by the integration test runner.');
    }
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    db = drizzle(pool, { schema });
  });

  beforeEach(async () => {
    await db.delete(staffAssignments);
    await db.delete(facilities);
    await db.delete(facilityTypes);
    await db.delete(users);

    const [staffUser, otherStaffUser, adminUser] = await db
      .insert(users)
      .values([
        { phoneNumber: '+251911000001' },
        { phoneNumber: '+251911000002' },
        { phoneNumber: '+251911000003' },
      ])
      .returning();
    staffUserId = staffUser.id;
    otherStaffUserId = otherStaffUser.id;
    adminUserId = adminUser.id;

    const [facilityType] = await db
      .insert(facilityTypes)
      .values({
        code: 'public_pool',
        name: 'Public Pool',
        operationalClassification: 'entrance_based',
      })
      .returning();
    const [facilityA, facilityB] = await db
      .insert(facilities)
      .values([
        {
          facilityTypeId: facilityType.id,
          name: 'Assigned Facility',
          address: 'Arada, Addis Ababa',
          location: { x: 38.7578, y: 9.0301 },
        },
        {
          facilityTypeId: facilityType.id,
          name: 'Unassigned Facility',
          address: 'Bole, Addis Ababa',
          location: { x: 38.789, y: 8.995 },
        },
      ])
      .returning();
    facilityAId = facilityA.id;
    facilityBId = facilityB.id;
  });

  afterAll(async () => {
    // The integration database is shared across spec files and is not reset
    // between them. Because staff_assignments references users and facilities
    // with ON DELETE RESTRICT, leaving rows behind would break the parent-row
    // cleanup in the users and facilities specs. Remove everything this spec
    // introduced, child rows first.
    await db.delete(staffAssignments);
    await db.delete(facilities);
    await db.delete(facilityTypes);
    await db.delete(users);
    await pool.end();
  });

  it('authorizes a staff member only through an active, in-window assignment', async () => {
    const now = new Date();
    const [assignment] = await db
      .insert(staffAssignments)
      .values({
        userId: staffUserId,
        facilityId: facilityAId,
        assignedByUserId: adminUserId,
        startsAt: new Date(now.getTime() - 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 60 * 60 * 1000),
      })
      .returning();

    await expect(
      findEffectiveAssignmentIds(staffUserId, facilityAId, now),
    ).resolves.toEqual([assignment.id]);
  });

  it('denies a revoked assignment even inside its original time window', async () => {
    const now = new Date();
    await db.insert(staffAssignments).values({
      userId: staffUserId,
      facilityId: facilityAId,
      assignedByUserId: adminUserId,
      assignmentStatus: 'revoked',
      startsAt: new Date(now.getTime() - 60 * 60 * 1000),
      endsAt: new Date(now.getTime() + 60 * 60 * 1000),
      revokedAt: now,
      revokedByUserId: adminUserId,
    });

    await expect(
      findEffectiveAssignmentIds(staffUserId, facilityAId, now),
    ).resolves.toEqual([]);
  });

  it('denies assignments that have not started or have already ended', async () => {
    const now = new Date();
    await db.insert(staffAssignments).values([
      {
        userId: staffUserId,
        facilityId: facilityAId,
        assignedByUserId: adminUserId,
        startsAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
      {
        userId: otherStaffUserId,
        facilityId: facilityAId,
        assignedByUserId: adminUserId,
        startsAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() - 60 * 60 * 1000),
      },
    ]);

    await expect(
      findEffectiveAssignmentIds(staffUserId, facilityAId, now),
    ).resolves.toEqual([]);
    await expect(
      findEffectiveAssignmentIds(otherStaffUserId, facilityAId, now),
    ).resolves.toEqual([]);
  });

  it('denies access to a facility the staff member is not assigned to', async () => {
    const now = new Date();
    await db.insert(staffAssignments).values({
      userId: staffUserId,
      facilityId: facilityAId,
      assignedByUserId: adminUserId,
      startsAt: new Date(now.getTime() - 60 * 60 * 1000),
    });

    await expect(
      findEffectiveAssignmentIds(staffUserId, facilityBId, now),
    ).resolves.toEqual([]);
  });

  it('rejects an inverted or empty effective time range', async () => {
    const now = new Date();
    const invertedError = await getRejectedDatabaseError(
      db.insert(staffAssignments).values({
        userId: staffUserId,
        facilityId: facilityAId,
        assignedByUserId: adminUserId,
        startsAt: now,
        endsAt: new Date(now.getTime() - 1000),
      }),
    );
    expect(invertedError.code).toBe('23514');
    expect(invertedError.constraint).toBe('chk_staff_assignments__time_range');

    const emptyRangeError = await getRejectedDatabaseError(
      db.insert(staffAssignments).values({
        userId: staffUserId,
        facilityId: facilityAId,
        assignedByUserId: adminUserId,
        startsAt: now,
        endsAt: now,
      }),
    );
    expect(emptyRangeError.constraint).toBe('chk_staff_assignments__time_range');
  });

  it('rejects revocation state that is internally inconsistent', async () => {
    const now = new Date();
    const activeWithRevocationError = await getRejectedDatabaseError(
      db.insert(staffAssignments).values({
        userId: staffUserId,
        facilityId: facilityAId,
        assignedByUserId: adminUserId,
        assignmentStatus: 'active',
        startsAt: now,
        revokedAt: now,
        revokedByUserId: adminUserId,
      }),
    );
    expect(activeWithRevocationError.code).toBe('23514');
    expect(activeWithRevocationError.constraint).toBe(
      'chk_staff_assignments__revocation_consistency',
    );

    const revokedWithoutMetadataError = await getRejectedDatabaseError(
      db.insert(staffAssignments).values({
        userId: staffUserId,
        facilityId: facilityAId,
        assignedByUserId: adminUserId,
        assignmentStatus: 'revoked',
        startsAt: now,
      }),
    );
    expect(revokedWithoutMetadataError.constraint).toBe(
      'chk_staff_assignments__revocation_consistency',
    );
  });

  it('permits only one active assignment per staff member and facility but allows reassignment after revocation', async () => {
    const now = new Date();
    const [firstAssignment] = await db
      .insert(staffAssignments)
      .values({
        userId: staffUserId,
        facilityId: facilityAId,
        assignedByUserId: adminUserId,
        startsAt: new Date(now.getTime() - 60 * 60 * 1000),
      })
      .returning();

    const duplicateActiveError = await getRejectedDatabaseError(
      db.insert(staffAssignments).values({
        userId: staffUserId,
        facilityId: facilityAId,
        assignedByUserId: adminUserId,
        startsAt: now,
      }),
    );
    expect(duplicateActiveError.code).toBe('23505');
    expect(duplicateActiveError.constraint).toBe(
      'uidx_staff_assignments__user_facility__where_active',
    );

    await db
      .update(staffAssignments)
      .set({
        assignmentStatus: 'revoked',
        revokedAt: now,
        revokedByUserId: adminUserId,
      })
      .where(eq(staffAssignments.id, firstAssignment.id));

    await expect(
      db.insert(staffAssignments).values({
        userId: staffUserId,
        facilityId: facilityAId,
        assignedByUserId: adminUserId,
        startsAt: now,
      }),
    ).resolves.not.toThrow();
  });

  it('rejects unknown users or facilities and protects referenced records', async () => {
    const now = new Date();
    const unknownUserError = await getRejectedDatabaseError(
      db.insert(staffAssignments).values({
        userId: randomUUID(),
        facilityId: facilityAId,
        assignedByUserId: adminUserId,
        startsAt: now,
      }),
    );
    expect(unknownUserError.code).toBe('23503');
    expect(unknownUserError.constraint).toBe('fk_staff_assignments__user_id__users');

    const unknownFacilityError = await getRejectedDatabaseError(
      db.insert(staffAssignments).values({
        userId: staffUserId,
        facilityId: randomUUID(),
        assignedByUserId: adminUserId,
        startsAt: now,
      }),
    );
    expect(unknownFacilityError.code).toBe('23503');
    expect(unknownFacilityError.constraint).toBe(
      'fk_staff_assignments__facility_id__facilities',
    );

    await db.insert(staffAssignments).values({
      userId: staffUserId,
      facilityId: facilityAId,
      assignedByUserId: adminUserId,
      startsAt: now,
    });

    const deleteUserError = await getRejectedDatabaseError(
      db.delete(users).where(eq(users.id, staffUserId)),
    );
    expect(deleteUserError.code).toBe('23503');

    const deleteFacilityError = await getRejectedDatabaseError(
      db.delete(facilities).where(eq(facilities.id, facilityAId)),
    );
    expect(deleteFacilityError.code).toBe('23503');
  });
});

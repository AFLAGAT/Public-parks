import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  checkIns,
  facilities,
  facilityTypes,
  qrCodes,
  schema,
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

/** Truncates to the minute, matching Postgres `date_trunc('minute', ...)` under UTC. */
function minute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000);
}

describe('check_ins schema integration', () => {
  const databaseUrl = process.env.DB_PRIMARY_URL;
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;

  let staffUserId: string;
  let facilityId: string;
  let qrCodeId: string;

  function acceptedScan(overrides: Partial<typeof checkIns.$inferInsert> = {}) {
    const scannedAt = overrides.scannedAt ?? new Date();
    return {
      qrCodeId,
      staffUserId,
      facilityId,
      deviceId: 'gate-device-001',
      validationSource: 'online' as const,
      checkInResult: 'accepted' as const,
      scannedAt,
      scanMinute: minute(scannedAt),
      ...overrides,
    };
  }

  beforeAll(() => {
    if (!databaseUrl) {
      throw new Error('DB_PRIMARY_URL must be set by the integration test runner.');
    }
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    db = drizzle(pool, { schema });
  });

  beforeEach(async () => {
    await db.delete(checkIns);
    await db.delete(qrCodes);
    await db.delete(facilities);
    await db.delete(facilityTypes);
    await db.delete(users);

    const [staffUser] = await db
      .insert(users)
      .values({ phoneNumber: '+251911000010' })
      .returning();
    staffUserId = staffUser.id;

    const [facilityType] = await db
      .insert(facilityTypes)
      .values({
        code: 'public_pool',
        name: 'Public Pool',
        operationalClassification: 'entrance_based',
      })
      .returning();
    const [facility] = await db
      .insert(facilities)
      .values({
        facilityTypeId: facilityType.id,
        name: 'Gate Facility',
        address: 'Addis Ababa',
        location: { x: 38.7578, y: 9.0301 },
      })
      .returning();
    facilityId = facility.id;

    const [qrCode] = await db
      .insert(qrCodes)
      .values({ scannableType: 'entrance_ticket', scannableId: randomUUID() })
      .returning();
    qrCodeId = qrCode.id;
  });

  afterAll(async () => {
    await db.delete(checkIns);
    await db.delete(qrCodes);
    await db.delete(facilities);
    await db.delete(facilityTypes);
    await db.delete(users);
    await pool.end();
  });

  it('absorbs an exact offline replay through the idempotency key', async () => {
    // Anchor to the start of the current minute so both scans truncate to the
    // same scan_minute regardless of when in the minute the test runs.
    const minuteStart = minute(new Date());
    await db
      .insert(checkIns)
      .values(acceptedScan({ scannedAt: new Date(minuteStart.getTime() + 5_000) }));

    // Same device + QR + minute = the same logical scan re-submitted.
    const replayError = await getRejectedDatabaseError(
      db.insert(checkIns).values(
        acceptedScan({ scannedAt: new Date(minuteStart.getTime() + 20_000) }),
      ),
    );
    expect(replayError.code).toBe('23505');
    // On a partitioned table the unique violation surfaces against the leaf
    // partition's index, so assert on the idempotency columns rather than the
    // parent index name.
    expect(replayError.constraint).toMatch(/_device_id_qr_code_id_scan_minute_idx$/);
  });

  it('records distinct and conflicting scans as separate rows rather than dropping them', async () => {
    const scannedAt = new Date();
    await db.insert(checkIns).values(acceptedScan({ scannedAt }));

    // A different device scanning the same QR in the same minute is a distinct
    // logical scan; a single-use conflict is logged as a rejected row.
    await expect(
      db.insert(checkIns).values(
        acceptedScan({
          scannedAt,
          deviceId: 'gate-device-002',
          checkInResult: 'rejected',
          rejectionReason: 'already_checked_in',
        }),
      ),
    ).resolves.not.toThrow();

    const rows = await db.select().from(checkIns).where(eq(checkIns.qrCodeId, qrCodeId));
    expect(rows).toHaveLength(2);
  });

  it('rejects a scan_minute that is not the truncated scan time', async () => {
    const scannedAt = new Date();
    const error = await getRejectedDatabaseError(
      db.insert(checkIns).values(
        acceptedScan({
          scannedAt,
          // Off by 30 seconds from the true minute boundary.
          scanMinute: new Date(minute(scannedAt).getTime() + 30_000),
        }),
      ),
    );
    expect(error.code).toBe('23514');
    expect(error.constraint).toBe('chk_check_ins__scan_minute_truncated');
  });

  it('binds rejection_reason to a rejected result', async () => {
    const acceptedWithReasonError = await getRejectedDatabaseError(
      db.insert(checkIns).values(
        acceptedScan({ rejectionReason: 'should_not_be_here' }),
      ),
    );
    expect(acceptedWithReasonError.code).toBe('23514');
    expect(acceptedWithReasonError.constraint).toBe(
      'chk_check_ins__rejection_reason_consistency',
    );

    const rejectedWithoutReasonError = await getRejectedDatabaseError(
      db.insert(checkIns).values(
        acceptedScan({ deviceId: 'gate-device-003', checkInResult: 'rejected' }),
      ),
    );
    expect(rejectedWithoutReasonError.constraint).toBe(
      'chk_check_ins__rejection_reason_consistency',
    );
  });

  it('rejects unknown references and protects referenced records', async () => {
    const unknownQrError = await getRejectedDatabaseError(
      db.insert(checkIns).values(acceptedScan({ qrCodeId: randomUUID() })),
    );
    expect(unknownQrError.code).toBe('23503');
    expect(unknownQrError.constraint).toBe('fk_check_ins__qr_code_id__qr_codes');

    await db.insert(checkIns).values(acceptedScan());

    const deleteQrError = await getRejectedDatabaseError(
      db.delete(qrCodes).where(eq(qrCodes.id, qrCodeId)),
    );
    expect(deleteQrError.code).toBe('23503');

    const deleteUserError = await getRejectedDatabaseError(
      db.delete(users).where(eq(users.id, staffUserId)),
    );
    expect(deleteUserError.code).toBe('23503');
  });

  it('routes rows to the correct monthly partition and keeps a default safety net', async () => {
    const defaultPartition = await pool.query(
      `SELECT to_regclass('public.check_ins_default') IS NOT NULL AS present`,
    );
    expect((defaultPartition.rows[0] as { present: boolean }).present).toBe(true);

    const [currentScan] = await db
      .insert(checkIns)
      .values(acceptedScan({ scannedAt: new Date() }))
      .returning();
    const currentPartition = await pool.query(
      `SELECT tableoid::regclass::text AS partition FROM check_ins WHERE id = $1`,
      [currentScan.id],
    );
    const currentPartitionName = (currentPartition.rows[0] as { partition: string })
      .partition;
    expect(currentPartitionName).toMatch(/^check_ins_\d{4}_\d{2}$/);
    expect(currentPartitionName).not.toBe('check_ins_default');

    // A scan far outside the pre-created month partitions falls to the default.
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3650);
    const [futureScan] = await db
      .insert(checkIns)
      .values(acceptedScan({ scannedAt: farFuture, deviceId: 'gate-device-future' }))
      .returning();
    const futurePartition = await pool.query(
      `SELECT tableoid::regclass::text AS partition FROM check_ins WHERE id = $1`,
      [futureScan.id],
    );
    expect((futurePartition.rows[0] as { partition: string }).partition).toBe(
      'check_ins_default',
    );
  });
});

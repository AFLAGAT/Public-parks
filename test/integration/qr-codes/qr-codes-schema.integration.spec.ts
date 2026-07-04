import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { qrCodes, schema } from '../../../src/database/drizzle.schema';

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

describe('qr_codes schema integration', () => {
  const databaseUrl = process.env.DB_PRIMARY_URL;
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;

  /**
   * The credential a scan treats as valid: an active QR for the exact booking.
   * A revoked credential must never appear here.
   */
  async function findActiveCredentialIds(
    scannableType: 'slot_reservation' | 'entrance_ticket',
    scannableId: string,
  ): Promise<string[]> {
    const rows = await db
      .select({ id: qrCodes.id })
      .from(qrCodes)
      .where(
        and(
          eq(qrCodes.scannableType, scannableType),
          eq(qrCodes.scannableId, scannableId),
          eq(qrCodes.qrCodeStatus, 'active'),
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
    await db.delete(qrCodes);
  });

  afterAll(async () => {
    await db.delete(qrCodes);
    await pool.end();
  });

  it('issues one active credential per booking and reissues only after revocation', async () => {
    const ticketId = randomUUID();
    const [firstCredential] = await db
      .insert(qrCodes)
      .values({ scannableType: 'entrance_ticket', scannableId: ticketId })
      .returning();
    expect(firstCredential.qrCodeStatus).toBe('active');
    expect(firstCredential.revokedAt).toBeNull();

    const duplicateActiveError = await getRejectedDatabaseError(
      db
        .insert(qrCodes)
        .values({ scannableType: 'entrance_ticket', scannableId: ticketId }),
    );
    expect(duplicateActiveError.code).toBe('23505');
    expect(duplicateActiveError.constraint).toBe(
      'uidx_qr_codes__scannable__where_active',
    );

    await db
      .update(qrCodes)
      .set({ qrCodeStatus: 'revoked', revokedAt: new Date() })
      .where(eq(qrCodes.id, firstCredential.id));

    await expect(
      db
        .insert(qrCodes)
        .values({ scannableType: 'entrance_ticket', scannableId: ticketId }),
    ).resolves.not.toThrow();
  });

  it('excludes a revoked credential from the active-credential lookup', async () => {
    const reservationId = randomUUID();
    const [credential] = await db
      .insert(qrCodes)
      .values({ scannableType: 'slot_reservation', scannableId: reservationId })
      .returning();

    await expect(
      findActiveCredentialIds('slot_reservation', reservationId),
    ).resolves.toEqual([credential.id]);

    await db
      .update(qrCodes)
      .set({ qrCodeStatus: 'revoked', revokedAt: new Date() })
      .where(eq(qrCodes.id, credential.id));

    await expect(
      findActiveCredentialIds('slot_reservation', reservationId),
    ).resolves.toEqual([]);
  });

  it('rejects a scannable type outside the slot/entrance allowlist', async () => {
    // `shared_reservation_participant` is a valid payable type but is NOT a
    // scannable entity; the enum must refuse it so a QR can never be minted
    // against something the scan path is not meant to validate.
    const invalidTypeError = await getRejectedDatabaseError(
      pool.query(
        `INSERT INTO qr_codes (scannable_type, scannable_id) VALUES ($1, $2)`,
        ['shared_reservation_participant', randomUUID()],
      ),
    );
    expect(invalidTypeError.code).toBe('22P02');
  });

  it('rejects revocation state that is internally inconsistent', async () => {
    const activeWithRevocationError = await getRejectedDatabaseError(
      db.insert(qrCodes).values({
        scannableType: 'entrance_ticket',
        scannableId: randomUUID(),
        qrCodeStatus: 'active',
        revokedAt: new Date(),
      }),
    );
    expect(activeWithRevocationError.code).toBe('23514');
    expect(activeWithRevocationError.constraint).toBe(
      'chk_qr_codes__revocation_consistency',
    );

    const revokedWithoutTimestampError = await getRejectedDatabaseError(
      db.insert(qrCodes).values({
        scannableType: 'entrance_ticket',
        scannableId: randomUUID(),
        qrCodeStatus: 'revoked',
      }),
    );
    expect(revokedWithoutTimestampError.constraint).toBe(
      'chk_qr_codes__revocation_consistency',
    );
  });

  it('scopes the active-credential invariant per scannable type and id', async () => {
    const sharedId = randomUUID();
    await expect(
      db.insert(qrCodes).values([
        { scannableType: 'slot_reservation', scannableId: sharedId },
        { scannableType: 'entrance_ticket', scannableId: sharedId },
      ]),
    ).resolves.not.toThrow();

    await expect(
      findActiveCredentialIds('slot_reservation', sharedId),
    ).resolves.toHaveLength(1);
    await expect(
      findActiveCredentialIds('entrance_ticket', sharedId),
    ).resolves.toHaveLength(1);
  });
});

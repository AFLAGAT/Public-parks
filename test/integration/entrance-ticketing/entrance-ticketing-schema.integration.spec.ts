import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  entranceTickets,
  facilities,
  facilityCapacities,
  facilityTypes,
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

/** The confirmed oversell-safe purchase: no row returned = sold out. */
const ATOMIC_CAPACITY_SQL = `
  UPDATE facility_capacities SET sold_count = sold_count + $3, updated_at = now()
   WHERE facility_id = $1 AND service_date = $2
     AND sold_count + $3 <= max_capacity
   RETURNING id`;

const SERVICE_DATE = '2026-07-10';

describe('entrance ticketing schema integration', () => {
  const databaseUrl = process.env.DB_PRIMARY_URL;
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;

  let facilityId: string;
  let buyerUserId: string;

  beforeAll(() => {
    if (!databaseUrl) {
      throw new Error('DB_PRIMARY_URL must be set by the integration test runner.');
    }
    // max > 1 so the concurrency test can hold two connections at once.
    pool = new Pool({ connectionString: databaseUrl, max: 4 });
    db = drizzle(pool, { schema });
  });

  beforeEach(async () => {
    await db.delete(entranceTickets);
    await db.delete(facilityCapacities);
    await db.delete(facilities);
    await db.delete(facilityTypes);
    await db.delete(users);

    const [buyer] = await db
      .insert(users)
      .values({ phoneNumber: '+251911000020' })
      .returning();
    buyerUserId = buyer.id;

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
        name: 'Entrance Facility',
        address: 'Addis Ababa',
        location: { x: 38.7578, y: 9.0301 },
      })
      .returning();
    facilityId = facility.id;
  });

  afterAll(async () => {
    await db.delete(entranceTickets);
    await db.delete(facilityCapacities);
    await db.delete(facilities);
    await db.delete(facilityTypes);
    await db.delete(users);
    await pool.end();
  });

  async function seedCapacity(maxCapacity: number, soldCount = 0): Promise<void> {
    await db.insert(facilityCapacities).values({
      facilityId,
      serviceDate: SERVICE_DATE,
      maxCapacity,
      soldCount,
    });
  }

  async function soldCount(): Promise<number> {
    const [row] = await db
      .select({ soldCount: facilityCapacities.soldCount })
      .from(facilityCapacities)
      .where(eq(facilityCapacities.facilityId, facilityId));
    return row.soldCount;
  }

  it('persists a ticket with server-priced snapshot and default state', async () => {
    await seedCapacity(10);
    const [ticket] = await db
      .insert(entranceTickets)
      .values({
        facilityId,
        buyerUserId,
        visitDate: SERVICE_DATE,
        quantity: 2,
        unitPriceAtBooking: 5000,
        totalAmountAtBooking: 10000,
      })
      .returning();

    expect(ticket.entranceTicketStatus).toBe('pending_payment');
    expect(ticket.usedQuantity).toBe(0);
    expect(ticket.confirmedAt).toBeNull();
  });

  it('never oversells through the atomic conditional capacity update', async () => {
    await seedCapacity(5);

    const first = await pool.query(ATOMIC_CAPACITY_SQL, [facilityId, SERVICE_DATE, 3]);
    expect(first.rowCount).toBe(1);
    expect(await soldCount()).toBe(3);

    // 3 + 3 > 5 → sold out, no row, counter unchanged.
    const oversell = await pool.query(ATOMIC_CAPACITY_SQL, [facilityId, SERVICE_DATE, 3]);
    expect(oversell.rowCount).toBe(0);
    expect(await soldCount()).toBe(3);

    const last = await pool.query(ATOMIC_CAPACITY_SQL, [facilityId, SERVICE_DATE, 2]);
    expect(last.rowCount).toBe(1);
    expect(await soldCount()).toBe(5);

    const soldOut = await pool.query(ATOMIC_CAPACITY_SQL, [facilityId, SERVICE_DATE, 1]);
    expect(soldOut.rowCount).toBe(0);
    expect(await soldCount()).toBe(5);
  });

  it('lets only one concurrent purchase win the last unit', async () => {
    await seedCapacity(1);

    const [clientA, clientB] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      const results = await Promise.all([
        clientA.query(ATOMIC_CAPACITY_SQL, [facilityId, SERVICE_DATE, 1]),
        clientB.query(ATOMIC_CAPACITY_SQL, [facilityId, SERVICE_DATE, 1]),
      ]);
      const winners = results.filter((result) => result.rowCount === 1).length;
      expect(winners).toBe(1);
    } finally {
      clientA.release();
      clientB.release();
    }

    expect(await soldCount()).toBe(1);
  });

  it('rejects a duplicate capacity row and out-of-bounds counters', async () => {
    await seedCapacity(10);

    const duplicateError = await getRejectedDatabaseError(seedCapacity(20));
    expect(duplicateError.code).toBe('23505');
    expect(duplicateError.constraint).toBe(
      'uq_facility_capacities__facility_id_service_date',
    );

    const oversoldError = await getRejectedDatabaseError(
      db.insert(facilityCapacities).values({
        facilityId,
        serviceDate: '2026-07-11',
        maxCapacity: 10,
        soldCount: 11,
      }),
    );
    expect(oversoldError.code).toBe('23514');
    expect(oversoldError.constraint).toBe('chk_facility_capacities__sold_count_bounds');

    const negativeMaxError = await getRejectedDatabaseError(
      db.insert(facilityCapacities).values({
        facilityId,
        serviceDate: '2026-07-12',
        maxCapacity: -1,
      }),
    );
    expect(negativeMaxError.constraint).toBe(
      'chk_facility_capacities__max_capacity_nonnegative',
    );
  });

  it('refuses a ticket for a facility/date that has no capacity row', async () => {
    const error = await getRejectedDatabaseError(
      db.insert(entranceTickets).values({
        facilityId,
        buyerUserId,
        visitDate: SERVICE_DATE,
        quantity: 1,
        unitPriceAtBooking: 5000,
        totalAmountAtBooking: 5000,
      }),
    );
    expect(error.code).toBe('23503');
    expect(error.constraint).toBe(
      'fk_entrance_tickets__facility_service_date__facility_capacities',
    );
  });

  it('rejects invalid quantity, used-quantity, and tampered totals', async () => {
    await seedCapacity(10);

    const zeroQtyError = await getRejectedDatabaseError(
      db.insert(entranceTickets).values({
        facilityId,
        buyerUserId,
        visitDate: SERVICE_DATE,
        quantity: 0,
        unitPriceAtBooking: 5000,
        totalAmountAtBooking: 0,
      }),
    );
    expect(zeroQtyError.constraint).toBe('chk_entrance_tickets__quantity_positive');

    const usedTooHighError = await getRejectedDatabaseError(
      db.insert(entranceTickets).values({
        facilityId,
        buyerUserId,
        visitDate: SERVICE_DATE,
        quantity: 2,
        usedQuantity: 3,
        unitPriceAtBooking: 5000,
        totalAmountAtBooking: 10000,
      }),
    );
    expect(usedTooHighError.constraint).toBe(
      'chk_entrance_tickets__used_quantity_bounds',
    );

    const tamperedTotalError = await getRejectedDatabaseError(
      db.insert(entranceTickets).values({
        facilityId,
        buyerUserId,
        visitDate: SERVICE_DATE,
        quantity: 2,
        unitPriceAtBooking: 5000,
        totalAmountAtBooking: 1, // not 5000 * 2
      }),
    );
    expect(tamperedTotalError.constraint).toBe(
      'chk_entrance_tickets__total_matches_quantity',
    );
  });

  it('rejects unknown references and protects the capacity row a ticket depends on', async () => {
    await seedCapacity(10);

    const unknownBuyerError = await getRejectedDatabaseError(
      db.insert(entranceTickets).values({
        facilityId,
        buyerUserId: randomUUID(),
        visitDate: SERVICE_DATE,
        quantity: 1,
        unitPriceAtBooking: 5000,
        totalAmountAtBooking: 5000,
      }),
    );
    expect(unknownBuyerError.code).toBe('23503');
    expect(unknownBuyerError.constraint).toBe(
      'fk_entrance_tickets__buyer_user_id__users',
    );

    await db.insert(entranceTickets).values({
      facilityId,
      buyerUserId,
      visitDate: SERVICE_DATE,
      quantity: 1,
      unitPriceAtBooking: 5000,
      totalAmountAtBooking: 5000,
    });

    const deleteCapacityError = await getRejectedDatabaseError(
      db.delete(facilityCapacities).where(eq(facilityCapacities.facilityId, facilityId)),
    );
    expect(deleteCapacityError.code).toBe('23503');
    expect(deleteCapacityError.constraint).toBe(
      'fk_entrance_tickets__facility_service_date__facility_capacities',
    );

    const deleteBuyerError = await getRejectedDatabaseError(
      db.delete(users).where(eq(users.id, buyerUserId)),
    );
    expect(deleteBuyerError.code).toBe('23503');
  });
});

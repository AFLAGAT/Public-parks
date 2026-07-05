import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  paymentAttempts,
  payments,
  processedProviderEvents,
  schema,
  users,
  webhookEvents,
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

describe('payments schema integration', () => {
  const databaseUrl = process.env.DB_PRIMARY_URL;
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;
  let payerUserId: string;

  async function insertPayment(overrides: Partial<typeof payments.$inferInsert> = {}) {
    const [payment] = await db
      .insert(payments)
      .values({
        payableType: 'entrance_ticket',
        payableId: randomUUID(),
        payerUserId,
        amount: 10_000,
        ...overrides,
      })
      .returning();
    return payment;
  }

  beforeAll(() => {
    if (!databaseUrl) {
      throw new Error('DB_PRIMARY_URL must be set by the integration test runner.');
    }
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    db = drizzle(pool, { schema });
  });

  beforeEach(async () => {
    // processed_provider_events is immutable (no delete); tests use unique keys.
    await db.delete(webhookEvents);
    await db.delete(paymentAttempts);
    await db.delete(payments);
    await db.delete(users);

    const [payer] = await db
      .insert(users)
      .values({ phoneNumber: '+251911000030' })
      .returning();
    payerUserId = payer.id;
  });

  afterAll(async () => {
    await db.delete(webhookEvents);
    await db.delete(paymentAttempts);
    await db.delete(payments);
    await db.delete(users);
    await pool.end();
  });

  it('allows non-core updates but rejects mutating amount, payable, or payer', async () => {
    const payment = await insertPayment();

    // Status / refund / verification changes are allowed.
    await expect(
      db
        .update(payments)
        .set({ paymentStatus: 'verified', verifiedAt: new Date(), refundedAmount: 2_000 })
        .where(eq(payments.id, payment.id)),
    ).resolves.not.toThrow();

    const amountError = await getRejectedDatabaseError(
      db.update(payments).set({ amount: 999 }).where(eq(payments.id, payment.id)),
    );
    expect(amountError.code).toBe('55000');
    expect(amountError.message).toContain('immutable');

    const payableIdError = await getRejectedDatabaseError(
      db
        .update(payments)
        .set({ payableId: randomUUID() })
        .where(eq(payments.id, payment.id)),
    );
    expect(payableIdError.code).toBe('55000');

    const payableTypeError = await getRejectedDatabaseError(
      db
        .update(payments)
        .set({ payableType: 'slot_reservation' })
        .where(eq(payments.id, payment.id)),
    );
    expect(payableTypeError.code).toBe('55000');
  });

  it('permits only one payment per payable and bounds the refunded amount', async () => {
    const payableId = randomUUID();
    await insertPayment({ payableType: 'entrance_ticket', payableId });

    const duplicateError = await getRejectedDatabaseError(
      insertPayment({ payableType: 'entrance_ticket', payableId }),
    );
    expect(duplicateError.code).toBe('23505');
    expect(duplicateError.constraint).toBe('uidx_payments__payable_type_payable_id');

    const overRefundError = await getRejectedDatabaseError(
      insertPayment({ amount: 10_000, refundedAmount: 20_000 }),
    );
    expect(overRefundError.code).toBe('23514');
    expect(overRefundError.constraint).toBe('chk_payments__refunded_amount_bounds');

    const unknownPayerError = await getRejectedDatabaseError(
      insertPayment({ payerUserId: randomUUID() }),
    );
    expect(unknownPayerError.code).toBe('23503');
    expect(unknownPayerError.constraint).toBe('fk_payments__payer_user_id__users');
  });

  it('keeps attempt references unique per provider order and transaction', async () => {
    const payment = await insertPayment();

    await db.insert(paymentAttempts).values({
      paymentId: payment.id,
      attemptNumber: 1,
      providerKey: 'mock',
      merchantReference: 'ORDER-1',
      providerTransactionId: 'TXN-1',
      amount: 10_000,
    });

    const duplicateReferenceError = await getRejectedDatabaseError(
      db.insert(paymentAttempts).values({
        paymentId: payment.id,
        attemptNumber: 2,
        providerKey: 'mock',
        merchantReference: 'ORDER-1',
        amount: 10_000,
      }),
    );
    expect(duplicateReferenceError.constraint).toBe(
      'uidx_payment_attempts__merchant_reference',
    );

    const duplicateNumberError = await getRejectedDatabaseError(
      db.insert(paymentAttempts).values({
        paymentId: payment.id,
        attemptNumber: 1,
        providerKey: 'mock',
        merchantReference: 'ORDER-2',
        amount: 10_000,
      }),
    );
    expect(duplicateNumberError.constraint).toBe(
      'uidx_payment_attempts__payment_id_attempt_number',
    );

    const duplicateTxnError = await getRejectedDatabaseError(
      db.insert(paymentAttempts).values({
        paymentId: payment.id,
        attemptNumber: 3,
        providerKey: 'mock',
        merchantReference: 'ORDER-3',
        providerTransactionId: 'TXN-1',
        amount: 10_000,
      }),
    );
    expect(duplicateTxnError.constraint).toBe(
      'uidx_payment_attempts__provider_transaction_id',
    );

    // Two unresolved attempts (null transaction id) coexist.
    await expect(
      db.insert(paymentAttempts).values({
        paymentId: payment.id,
        attemptNumber: 4,
        providerKey: 'mock',
        merchantReference: 'ORDER-4',
        amount: 10_000,
      }),
    ).resolves.not.toThrow();
  });

  it('deduplicates provider events globally and keeps the ledger immutable', async () => {
    const providerEventId = `EVT-${randomUUID()}`;
    const [ledgerRow] = await db
      .insert(processedProviderEvents)
      .values({ providerKey: 'telebirr', providerEventId })
      .returning();

    const duplicateError = await getRejectedDatabaseError(
      db.insert(processedProviderEvents).values({
        providerKey: 'telebirr',
        providerEventId,
      }),
    );
    expect(duplicateError.code).toBe('23505');
    expect(duplicateError.constraint).toBe(
      'uidx_processed_provider_events__provider_key_provider_event_id',
    );

    const updateError = await getRejectedDatabaseError(
      db
        .update(processedProviderEvents)
        .set({ providerKey: 'mock' })
        .where(eq(processedProviderEvents.id, ledgerRow.id)),
    );
    expect(updateError.code).toBe('55000');
    expect(updateError.message).toContain('processed_provider_events are immutable');

    const deleteError = await getRejectedDatabaseError(
      db
        .delete(processedProviderEvents)
        .where(eq(processedProviderEvents.id, ledgerRow.id)),
    );
    expect(deleteError.code).toBe('55000');
  });

  it('routes webhook callbacks to the monthly partition with a default safety net', async () => {
    const present = await pool.query(
      `SELECT to_regclass('public.webhook_events_default') IS NOT NULL AS present`,
    );
    expect((present.rows[0] as { present: boolean }).present).toBe(true);

    const [current] = await db
      .insert(webhookEvents)
      .values({
        providerKey: 'telebirr',
        providerEventId: `EVT-${randomUUID()}`,
        normalizedIdempotencyKey: `telebirr:${randomUUID()}`,
        verificationResult: 'verified',
        rawPayload: { status: 'ok' },
        receivedAt: new Date(),
      })
      .returning();
    const currentPartition = await pool.query(
      `SELECT tableoid::regclass::text AS partition FROM webhook_events WHERE id = $1 AND received_at = $2`,
      [current.id, current.receivedAt],
    );
    const partitionName = (currentPartition.rows[0] as { partition: string }).partition;
    expect(partitionName).toMatch(/^webhook_events_\d{4}_\d{2}$/);
    expect(partitionName).not.toBe('webhook_events_default');

    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3650);
    const [future] = await db
      .insert(webhookEvents)
      .values({
        providerKey: 'telebirr',
        providerEventId: `EVT-${randomUUID()}`,
        normalizedIdempotencyKey: `telebirr:${randomUUID()}`,
        verificationResult: 'verified',
        rawPayload: { status: 'ok' },
        receivedAt: farFuture,
      })
      .returning();
    const futurePartition = await pool.query(
      `SELECT tableoid::regclass::text AS partition FROM webhook_events WHERE id = $1 AND received_at = $2`,
      [future.id, future.receivedAt],
    );
    expect((futurePartition.rows[0] as { partition: string }).partition).toBe(
      'webhook_events_default',
    );
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema, users } from '../../../src/database/drizzle.schema';

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

describe('users schema integration', () => {
  const databaseUrl = process.env.DB_PRIMARY_URL;
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;

  beforeAll(() => {
    if (!databaseUrl) {
      throw new Error('DB_PRIMARY_URL must be set by the integration test runner.');
    }
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    db = drizzle(pool, { schema });
  });

  beforeEach(async () => {
    await db.delete(users);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates client-neutral users through either normalized identity channel', async () => {
    const [phoneUser] = await db
      .insert(users)
      .values({ phoneNumber: '+251911123456' })
      .returning();
    const [emailUser] = await db
      .insert(users)
      .values({ email: 'resident@example.com' })
      .returning();

    expect(phoneUser).toMatchObject({
      phoneNumber: '+251911123456',
      email: null,
      isActive: true,
    });
    expect(emailUser).toMatchObject({
      phoneNumber: null,
      email: 'resident@example.com',
      isActive: true,
    });
    expect(phoneUser?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(phoneUser?.createdAt).toBeInstanceOf(Date);
    expect(phoneUser?.updatedAt).toBeInstanceOf(Date);
  });

  it.each([
    {
      name: 'phone number',
      first: { phoneNumber: '+251911123456' },
      duplicate: { phoneNumber: '+251911123456' },
      constraint: 'uidx_users__phone_number',
    },
    {
      name: 'email',
      first: { email: 'resident@example.com' },
      duplicate: { email: 'resident@example.com' },
      constraint: 'uidx_users__email',
    },
  ])('rejects a duplicate $name identity', async ({ first, duplicate, constraint }) => {
    await db.insert(users).values(first);

    const error = await getRejectedDatabaseError(db.insert(users).values(duplicate));

    expect(error.code).toBe('23505');
    expect(error.constraint).toBe(constraint);
  });

  it.each([
    {
      name: 'missing identity channels',
      values: {},
      constraint: 'chk_users__identity_channel_present',
    },
    {
      name: 'non-E.164 phone number',
      values: { phoneNumber: '0911123456' },
      constraint: 'chk_users__phone_number_e164',
    },
    {
      name: 'non-normalized email',
      values: { email: 'Resident@Example.com' },
      constraint: 'chk_users__email_normalized',
    },
    {
      name: 'phone verification without a phone number',
      values: { email: 'resident@example.com', phoneNumberVerifiedAt: new Date() },
      constraint: 'chk_users__phone_verification_has_phone_number',
    },
  ])('rejects $name', async ({ values, constraint }) => {
    const error = await getRejectedDatabaseError(db.insert(users).values(values));

    expect(error.code).toBe('23514');
    expect(error.constraint).toBe(constraint);
  });
});

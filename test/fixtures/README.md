# Test Fixtures

This directory will hold domain-specific fixture factories for creating test data.

## Status

**Empty — no domain tables exist yet.** Fixture factories will be created alongside Phase 3 schema entities. Do not invent domain factories before the schema is defined.

## Future structure (Phase 3+)

Once Phase 3 defines the database schema, each domain module should get a fixture factory file in this directory:

```
test/fixtures/
  users.fixtures.ts          # User test data factory
  facilities.fixtures.ts     # Facility test data factory
  slot-reservations.fixtures.ts
  entrance-tickets.fixtures.ts
  payments.fixtures.ts
  qr-codes.fixtures.ts
  ...
```

## Testing patterns for data isolation

### 1. Transaction rollback (preferred for ordinary integration tests)

Wrap each test in a database transaction that is rolled back at the end. This is the
fastest and most reliable isolation strategy because no cleanup is needed — the
transaction never commits.

**Important:** You must check out a single `PoolClient` from the pool to own the
transaction lifecycle (`BEGIN`, queries, `ROLLBACK`). Calling `pool.query()` directly
runs outside any transaction because `pg.Pool` auto-releases connections between calls.

```typescript
import { describe, it, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';

describe('some integration test', () => {
  let pool: Pool;
  let client: PoolClient;

  beforeEach(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
  });

  it('does something with the database', async () => {
    // Use client.query() instead of pool.query() — this runs inside
    // the transaction that will be rolled back.
    const result = await client.query('SELECT 1 AS val');
    // ... assertions ...
  });
});
```

**Caveats:**
- DDL (CREATE TABLE, ALTER TABLE, etc.) **does not** auto-commit in PostgreSQL
  when executed inside a transaction block. DDL statements respect the surrounding
  transaction and are rolled back along with everything else. This is a common
  misconception; PostgreSQL's transactional DDL is one of its key strengths.
- Cannot test concurrent access within the same connection (use explicit cleanup
  for concurrency tests).
- Nested transactions (SAVEPOINT) work but need care.

### 2. Committed rows with explicit cleanup (for concurrency tests)

For tests that need committed data (e.g. testing concurrent capacity locking), insert
test data explicitly and clean up in `afterAll`:

```typescript
import { describe, it, afterAll, beforeAll } from 'vitest';
import { Pool } from 'pg';

describe('concurrent capacity test', () => {
  const pool = new Pool({ connectionString: process.env.DB_PRIMARY_URL });
  const TEST_FACILITY_ID = '00000000-0000-0000-0000-000000000001';

  afterAll(async () => {
    await pool.query('DELETE FROM facility_capacities WHERE facility_id = $1', [TEST_FACILITY_ID]);
    await pool.end();
  });

  it('prevents overselling under concurrent purchases', async () => {
    // ... concurrency test using committed rows
  });
});
```

**Caveats:**
- Requires deterministic cleanup that does not interfere with other tests.
- Prefer UUID-based test IDs with a known prefix for easy cleanup.

## Principles

1. **Never reuse data between tests.** Each test (or `describe` block) creates the data
   it needs and cleans up after itself.
2. **Prefer transaction rollback over explicit cleanup.** It's faster, safer, and
   eliminates cleanup-ordering bugs.
3. **Use committed rows only for concurrency/locking tests** that need real isolation
   levels. Document why the test needs committed rows.
4. **Do not invent domain factories before Phase 3.** The schema must exist first.
5. **Factories should produce valid-by-default entities.** Optional overrides via
   a spread parameter pattern:

   ```typescript
   function createTestFacility(overrides?: Partial<Facility>): NewFacility {
     return {
       id: crypto.randomUUID(),
       name: 'Test Facility',
       facilityType: 'park',
       isActive: true,
       createdAt: new Date(),
       updatedAt: new Date(),
       ...overrides,
     };
   }
   ```

6. **Avoid shared mutable state.** Factory functions are pure: same inputs → same
   outputs (except for auto-generated UUIDs/timestamps).

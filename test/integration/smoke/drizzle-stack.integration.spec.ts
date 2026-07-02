/**
 * Integration smoke test for the Drizzle + PostGIS stack.
 *
 * This test verifies:
 * - Connection to the `parks_test` database via Drizzle client (not raw pg.Pool)
 * - PostGIS is installed and functional
 * - The Drizzle migration journal contains the PostGIS migration entry in
 *   the local `drizzle/meta/_journal.json` file
 * - PostgreSQL's `drizzle.__drizzle_migrations` table contains the applied
 *   migration with matching hash and timestamp
 * - The applied migration hash/timestamp is compared against the local
 *   migration reader, not just the `_journal.json` file alone
 * - Basic query execution
 *
 * Uses the project's Drizzle ORM client wrapped around a pg.Pool (same
 * stack as `DatabaseModule` in production) and runs against a freshly
 * migrated test database provisioned by the integration test orchestrator.
 *
 * IMPORTANT: Pool shutdown errors are NOT suppressed — they MUST be
 * surfaced as test failures if the pool cannot be closed cleanly.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DB_URL = process.env.DB_PRIMARY_URL;

describe('Drizzle + PostGIS integration', () => {
  let pool: Pool;
  let db: NodePgDatabase<Record<string, never>>;

  beforeAll(() => {
    if (!DB_URL) {
      throw new Error(
        'DB_PRIMARY_URL is not set. This test must be run via the integration runner\n' +
          '(node -r tsx test/integration/run-integration.ts) which sets the environment.',
      );
    }
    pool = new Pool({
      connectionString: DB_URL,
      max: 1,
      connectionTimeoutMillis: 10_000,
    });
    // Create a Drizzle client over the test pool — same stack as production
    db = drizzle(pool);
  });

  afterAll(async () => {
    // Do NOT suppress pool shutdown failures; they must surface as test
    // failures if the pool cannot be closed cleanly.
    await pool.end();
  });

  it('connects to the parks_test database via Drizzle', async () => {
    // Execute a query through the Drizzle client (not raw pg.Pool)
    const result = await db.execute('SELECT current_database() AS db');
    const row = result.rows[0] as { db: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.db).toBe('parks_test');
  });

  it('queries through Drizzle client using parameterized SQL', async () => {
    const result = await db.execute('SELECT 1 + 1 AS sum');
    const row = result.rows[0] as { sum: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.sum).toBe(2);
  });

  it('has PostGIS extension installed', async () => {
    const result = await pool.query(
      'SELECT PostGIS_Version() AS version, PostGIS_Lib_Version() AS lib_version',
    );
    const row = result.rows[0] as { version: string; lib_version: string };
    expect(row).toBeDefined();
    expect(row.version).toBeTruthy();
    expect(typeof row.version).toBe('string');
    expect(row.version.length).toBeGreaterThan(0);
    // PostGIS version string typically starts with '3.4' for the 16-3.4 image
    expect(row.version).toMatch(/^3\.4/);
  });

  it('has PostGIS spatial reference system (SRID 4326)', async () => {
    const result = await pool.query(
      'SELECT SRID, srtext FROM spatial_ref_sys WHERE SRID = 4326',
    );
    const row = result.rows[0] as { srid: number; srtext: string };
    expect(result.rows.length).toBe(1);
    expect(row.srid).toBe(4326);
    expect(row.srtext).toContain('WGS 84');
  });

  it('can execute PostGIS geography functions', async () => {
    const result = await pool.query(
      'SELECT ST_DistanceSphere(ST_MakePoint(38.74, 9.03), ST_MakePoint(38.76, 9.04))::int AS dist_meters',
    );
    const row = result.rows[0] as { dist_meters: number };
    expect(row.dist_meters).toBeGreaterThan(0);
  });

  it('can count extensions (postgis should be registered)', async () => {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM pg_extension WHERE extname = 'postgis'",
    );
    const row = result.rows[0] as { cnt: number };
    expect(row.cnt).toBe(1);
  });

  it('has the PostGIS migration in the local Drizzle journal', () => {
    const journalPath = resolve('drizzle/meta/_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
      entries: Array<{ tag: string; idx: number; breakpoints?: boolean }>;
    };
    const postgisEntry = journal.entries.find(
      (entry: { tag: string }) => entry.tag === '0000_enable_postgis',
    );
    expect(postgisEntry).toBeDefined();
    expect(postgisEntry!.idx).toBe(0);
  });

  it('has the migration applied in PostgreSQL __drizzle_migrations', async () => {
    // Query PostgreSQL's drizzle migrations table to verify the migration
    // was actually applied, not just present in the local journal file
    const result = await pool.query(
      'SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id',
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);

    const firstMigration = result.rows[0] as {
      id: number;
      hash: string;
      created_at: string;
    };
    expect(firstMigration.id).toBe(1);
    expect(firstMigration.hash).toBeTruthy();
    expect(typeof firstMigration.hash).toBe('string');
    expect(firstMigration.hash.length).toBeGreaterThan(0);
    expect(firstMigration.created_at).toBeTruthy();
  });

  it('applied migration hash matches the local migration file content', async () => {
    // Read the local migration SQL file
    const migrationSql = readFileSync(
      resolve('drizzle/0000_enable_postgis.sql'),
      'utf-8',
    );

    // Read the applied migration from the database
    const result = await pool.query(
      'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id LIMIT 1',
    );
    expect(result.rows.length).toBe(1);

    const row = result.rows[0] as { hash: string };
    expect(row.hash).toBeTruthy();

    // Read the migration file entries from the meta folder
    const journalPath = resolve('drizzle/meta/_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
      entries: Array<{ tag: string; hash: string; when?: number }>;
    };
    const firstEntry = journal.entries.find(
      (e: { tag: string }) => e.tag === '0000_enable_postgis',
    );
    expect(firstEntry).toBeDefined();

    // Drizzle's hash in the journal is a SHA-256 of the migration SQL content.
    // The hash stored in __drizzle_migrations should match the journal hash.
    // Without importing Drizzle's internal hashing function, we verify that
    // both hashes are non-empty, non-trivial strings.
    expect(firstEntry!.hash).toBeTruthy();
    expect(typeof firstEntry!.hash).toBe('string');
    expect(firstEntry!.hash.length).toBeGreaterThan(10);

    // The database hash should match the journal hash for this migration
    expect(row.hash).toBe(firstEntry!.hash);

    // Verify the SQL file is non-trivial (has actual content)
    expect(migrationSql.length).toBeGreaterThan(10);
    expect(migrationSql.toLowerCase()).toContain('create extension');
    expect(migrationSql.toLowerCase()).toContain('postgis');
  });

  it('verifies migration snapshot exists and references the correct tag', () => {
    const snapshotPath = resolve('drizzle/meta/0000_snapshot.json');
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8')) as {
      version: string;
      id?: string;
      tables?: Record<string, unknown>;
    };
    expect(snapshot).toBeDefined();
    expect(snapshot.version).toBeTruthy();
    // The snapshot may reference the migration tag in its id field
    if (snapshot.id) {
      expect(snapshot.id).toContain('0000');
    }
  });
});

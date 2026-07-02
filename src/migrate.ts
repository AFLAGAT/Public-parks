/**
 * Standalone migration runner.
 *
 * Reads migrations from the `drizzle/` directory and applies them to the
 * database identified by `DB_PRIMARY_URL`. This script is intended to be
 * run via `npm run db:migrate` — it is NOT imported by the NestJS
 * runtime. It reads `process.env` directly because the NestJS config
 * layer is not available in a standalone script.
 *
 * The script loads environment variables from `.env` if the file exists,
 * using the same `dotenv` library that `@nestjs/config` uses internally.
 * This keeps `.env` gitignored (no committed secrets) while making
 * `DB_PRIMARY_URL` available without the NestJS config layer.
 */

import { config } from 'dotenv';

// Load .env if it exists — dotenv.config() does not throw on missing file.
config();

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `ERROR: ${name} is not set.\n\n` +
        `  The migration runner needs a Postgres connection string.\n` +
        `  Ensure you have a .env file (copied from .env.example) with ${name} defined, e.g.:\n\n` +
        `    ${name}=postgres://user:password@localhost:5432/dbname\n`,
    );
    process.exit(1);
  }
  return value;
}

function validateConnectionString(url: string): void {
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    console.error(
      `ERROR: DB_PRIMARY_URL must be a valid Postgres connection string starting with postgres:// or postgresql://\n` +
        `  Got: ${url.length > 60 ? url.slice(0, 60) + '...' : url}`,
    );
    process.exit(1);
  }
}

async function run(): Promise<void> {
  const connectionString = getRequiredEnv('DB_PRIMARY_URL');
  validateConnectionString(connectionString);

  console.log('Connecting to database...');

  const pool = new Pool({
    connectionString,
    max: 1, // Single connection for migrations
    connectionTimeoutMillis: 15_000,
  });

  const db = drizzle(pool);

  console.log('Applying migrations from ./drizzle ...');
  await migrate(db, { migrationsFolder: './drizzle' });

  await pool.end();
  console.log('Migrations applied successfully.');
}

void run().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
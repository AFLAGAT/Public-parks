import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * This config is used by the drizzle-kit CLI for generating and applying
 * migrations. It is NOT imported by runtime application code — runtime
 * code reads `DB_PRIMARY_URL` through `DatabaseConfigService` and the
 * Zod-validated config layer. CLI tooling reads `process.env` directly
 * because the config layer is a NestJS construct and is not available in
 * the drizzle-kit CLI process.
 */
function getDbUrl(): string {
  const url = process.env.DB_PRIMARY_URL;
  if (!url) {
    throw new Error(
      'DB_PRIMARY_URL is not set. Drizzle Kit requires a Postgres connection string. ' +
        'Ensure you have a .env file (copied from .env.example) with DB_PRIMARY_URL defined.',
    );
  }
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    throw new Error(
      `DB_PRIMARY_URL must be a postgres:// or postgresql:// connection string, got: ${url.slice(0, 30)}...`,
    );
  }
  return url;
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/drizzle.schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: getDbUrl(),
  },
});
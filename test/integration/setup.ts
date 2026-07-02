/**
 * Vitest setup file for integration tests.
 *
 * Runs the database safety guard before any integration test executes.
 * This provides protection even when integration tests are run directly
 * (via vitest --config vitest.config.integration.ts) rather than through
 * the orchestrator.
 *
 * The guard validates:
 * 1. APP_NODE_ENV is exactly 'test'
 * 2. DB_PRIMARY_URL points to a local/loopback host
 * 3. The database name is an unambiguous test name (test, test_*, *_test)
 *
 * If the guard fails, Vitest fails early with a clear error before any
 * test file is loaded.
 */

import { validateTestDatabaseUrl } from './helpers/test-database.guard';

try {
  validateTestDatabaseUrl(process.env.DB_PRIMARY_URL);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('\n[setup] Database safety guard FAILED — aborting integration tests.');
  console.error(`[setup] ${message}\n`);
  process.exit(1);
}

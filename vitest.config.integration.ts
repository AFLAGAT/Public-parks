import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for integration tests.
 *
 * This config targets test/integration files with .integration.spec.ts
 * extension only. The orchestrator (run-integration.ts) sets DB_PRIMARY_URL
 * before spawning vitest, so the correct test database URL is available in
 * the environment.
 *
 * Longer timeouts are needed because integration tests connect to a real
 * PostgreSQL/PostGIS database and may run queries that take longer than
 * typical unit tests.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/integration/**/*.integration.spec.ts'],
    passWithNoTests: false,
    setupFiles: ['test/integration/setup.ts'],
    env: {
      APP_NODE_ENV: 'test',
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

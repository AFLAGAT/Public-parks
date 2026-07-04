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
    fileParallelism: false,
    env: {
      APP_NODE_ENV: 'test',
      REDIS_URL: 'redis://localhost:6380/1',
      AUTH_JWT_KEYS_JSON:
        '{"test-v1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
      AUTH_JWT_ACTIVE_KEY_ID: 'test-v1',
      AUTH_OTP_HASH_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      AUTH_TOKEN_HASH_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      AUTH_CSRF_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      APP_FIELD_ENCRYPTION_KEYS_JSON:
        '{"test-v1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
      APP_FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'test-v1',
      SUPER_ADMIN_WEB_ORIGINS: 'http://localhost:3001',
      DEV_SMS_INBOX_TOKEN: 'test-development-inbox-token-0001',
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

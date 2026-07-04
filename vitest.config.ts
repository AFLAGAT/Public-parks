import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{spec,test}.ts', 'test/**/!(*.integration).{spec,test}.ts'],
    passWithNoTests: false,
    env: {
      APP_NODE_ENV: 'test',
      DB_PRIMARY_URL: 'postgres://parks:parks_dev@localhost:5432/parks_test',
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
  },
});

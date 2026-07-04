import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { type ConfigService } from '@nestjs/config';
import { DatabaseConfigService } from './database-config.service';
import type { Env } from './env.schema';

const securityEnv: Omit<
  Env,
  'APP_NODE_ENV' | 'APP_PORT' | 'LOG_LEVEL' | 'DB_PRIMARY_URL' | 'APP_ENABLE_DOCS'
> = {
  REDIS_URL: 'redis://localhost:6379/0',
  AUTH_JWT_KEYS_JSON: '{"dev-v1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
  AUTH_JWT_ACTIVE_KEY_ID: 'dev-v1',
  AUTH_OTP_HASH_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  AUTH_TOKEN_HASH_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  AUTH_CSRF_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  APP_FIELD_ENCRYPTION_KEYS_JSON:
    '{"dev-v1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
  APP_FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'dev-v1',
  SUPER_ADMIN_WEB_ORIGINS: 'http://localhost:3001',
  DEV_SMS_INBOX_TOKEN: '',
};

function makeConfig(env: Env): ConfigService<Env, true> {
  return {
    get: <K extends keyof Env>(key: K): Env[K] => env[key],
  } as unknown as ConfigService<Env, true>;
}

describe('DatabaseConfigService', () => {
  it('exposes the primary database URL', () => {
    const service = new DatabaseConfigService(
      makeConfig({
        ...securityEnv,
        APP_NODE_ENV: 'development',
        APP_PORT: 3000,
        LOG_LEVEL: 'info',
        DB_PRIMARY_URL: 'postgres://parks:parks_dev@localhost:5432/parks_dev',
        APP_ENABLE_DOCS: false,
      }),
    );

    expect(service.primaryUrl).toBe('postgres://parks:parks_dev@localhost:5432/parks_dev');
  });
});

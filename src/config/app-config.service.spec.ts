import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { type ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import type { Env } from './env.schema';

const securityEnv: Pick<
  Env,
  | 'REDIS_URL'
  | 'AUTH_JWT_KEYS_JSON'
  | 'AUTH_JWT_ACTIVE_KEY_ID'
  | 'AUTH_OTP_HASH_KEY'
  | 'AUTH_TOKEN_HASH_KEY'
  | 'AUTH_CSRF_KEY'
  | 'APP_FIELD_ENCRYPTION_KEYS_JSON'
  | 'APP_FIELD_ENCRYPTION_ACTIVE_KEY_ID'
  | 'SUPER_ADMIN_WEB_ORIGINS'
  | 'DEV_SMS_INBOX_TOKEN'
> = {
  REDIS_URL: 'rediss://redis.internal:6379/0',
  AUTH_JWT_KEYS_JSON: '{"v1":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE="}',
  AUTH_JWT_ACTIVE_KEY_ID: 'v1',
  AUTH_OTP_HASH_KEY: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=',
  AUTH_TOKEN_HASH_KEY: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=',
  AUTH_CSRF_KEY: 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM=',
  APP_FIELD_ENCRYPTION_KEYS_JSON:
    '{"v1":"BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ="}',
  APP_FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
  SUPER_ADMIN_WEB_ORIGINS: 'https://admin.example.com',
  DEV_SMS_INBOX_TOKEN: '',
};

function makeConfig(env: Env): ConfigService<Env, true> {
  return {
    get: <K extends keyof Env>(key: K): Env[K] => env[key],
  } as unknown as ConfigService<Env, true>;
}

describe('AppConfigService', () => {
  it('exposes typed getters that proxy ConfigService', () => {
    const service = new AppConfigService(
      makeConfig({
        ...securityEnv,
        APP_NODE_ENV: 'production',
        APP_PORT: 8080,
        LOG_LEVEL: 'warn',
        DB_PRIMARY_URL: 'postgres://prod-db.internal:5432/parks',
        APP_ENABLE_DOCS: false,
      }),
    );

    expect(service.nodeEnv).toBe('production');
    expect(service.port).toBe(8080);
    expect(service.logLevel).toBe('warn');
    expect(service.isProduction).toBe(true);
    expect(service.isTest).toBe(false);
    expect(service.enableDocs).toBe(false);
  });

  it('reports isTest when APP_NODE_ENV is test', () => {
    const service = new AppConfigService(
      makeConfig({
        ...securityEnv,
        APP_NODE_ENV: 'test',
        APP_PORT: 3000,
        LOG_LEVEL: 'info',
        DB_PRIMARY_URL: 'postgres://parks:parks_dev@localhost:5432/parks_test',
        APP_ENABLE_DOCS: false,
      }),
    );

    expect(service.isProduction).toBe(false);
    expect(service.isTest).toBe(true);
  });

  it('returns enableDocs from APP_ENABLE_DOCS env', () => {
    const service = new AppConfigService(
      makeConfig({
        ...securityEnv,
        APP_NODE_ENV: 'development',
        APP_PORT: 3000,
        LOG_LEVEL: 'info',
        DB_PRIMARY_URL: 'postgres://parks:parks_dev@localhost:5432/parks_dev',
        APP_ENABLE_DOCS: true,
      }),
    );

    expect(service.enableDocs).toBe(true);
  });
});

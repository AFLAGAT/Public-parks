import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import type { Env } from './env.schema';

function makeConfig(env: Env): ConfigService<Env, true> {
  return {
    get: <K extends keyof Env>(key: K): Env[K] => env[key],
  } as unknown as ConfigService<Env, true>;
}

describe('AppConfigService', () => {
  it('exposes typed getters that proxy ConfigService', () => {
    const service = new AppConfigService(
      makeConfig({
        APP_NODE_ENV: 'production',
        APP_PORT: 8080,
        LOG_LEVEL: 'warn',
        DB_PRIMARY_URL: 'postgres://prod-db.internal:5432/parks',
      }),
    );

    expect(service.nodeEnv).toBe('production');
    expect(service.port).toBe(8080);
    expect(service.logLevel).toBe('warn');
    expect(service.isProduction).toBe(true);
    expect(service.isTest).toBe(false);
  });

  it('reports isTest when APP_NODE_ENV is test', () => {
    const service = new AppConfigService(
      makeConfig({
        APP_NODE_ENV: 'test',
        APP_PORT: 3000,
        LOG_LEVEL: 'info',
        DB_PRIMARY_URL: 'postgres://parks:parks_dev@localhost:5432/parks_test',
      }),
    );

    expect(service.isProduction).toBe(false);
    expect(service.isTest).toBe(true);
  });
});

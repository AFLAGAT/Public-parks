import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { DatabaseConfigService } from './database-config.service';
import type { Env } from './env.schema';

function makeConfig(env: Env): ConfigService<Env, true> {
  return {
    get: <K extends keyof Env>(key: K): Env[K] => env[key],
  } as unknown as ConfigService<Env, true>;
}

describe('DatabaseConfigService', () => {
  it('exposes the primary database URL', () => {
    const service = new DatabaseConfigService(
      makeConfig({
        APP_NODE_ENV: 'development',
        APP_PORT: 3000,
        LOG_LEVEL: 'info',
        DB_PRIMARY_URL: 'postgres://parks:parks_dev@localhost:5432/parks_dev',
      }),
    );

    expect(service.primaryUrl).toBe('postgres://parks:parks_dev@localhost:5432/parks_dev');
  });
});

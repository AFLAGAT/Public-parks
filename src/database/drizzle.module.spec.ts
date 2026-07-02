import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  DatabaseModule,
  DRIZZLE_CLIENT,
  DRIZZLE_POOL,
  type DrizzleClient,
} from './drizzle.module';

describe('DatabaseModule', () => {
  it('registers the DRIZZLE_CLIENT token and compiles without a live database', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      .overrideProvider(DRIZZLE_POOL)
      .useValue({ end: () => Promise.resolve() })
      .overrideProvider(DRIZZLE_CLIENT)
      .useValue({
        select: () => ({ from: () => Promise.resolve([]) }),
        query: {},
        _: { schema: {}, fullSchema: {} },
      })
      .compile();

    const client = moduleRef.get<DrizzleClient>(DRIZZLE_CLIENT);
    expect(client).toBeDefined();
    expect(typeof client).toBe('object');

    await moduleRef.close();
  });

  it('closes the pool gracefully on application shutdown', async () => {
    const endMock = vi.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      .overrideProvider(DRIZZLE_POOL)
      .useValue({ end: endMock })
      .overrideProvider(DRIZZLE_CLIENT)
      .useValue({
        select: () => ({ from: () => Promise.resolve([]) }),
        query: {},
        _: { schema: {}, fullSchema: {} },
      })
      .compile();

    const app = moduleRef.get(DatabaseModule);
    await app.onApplicationShutdown();

    expect(endMock).toHaveBeenCalledOnce();
  });
});

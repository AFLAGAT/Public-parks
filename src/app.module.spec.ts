import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { DRIZZLE_CLIENT, DRIZZLE_POOL } from './database/drizzle.module';

describe('AppModule', () => {
  it('compiles with all domain modules registered', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE_POOL)
      .useValue({ end: () => Promise.resolve() })
      .overrideProvider(DRIZZLE_CLIENT)
      .useValue({ select: () => ({ from: () => Promise.resolve([]) }) })
      .compile();

    expect(moduleRef.get(AppModule)).toBeDefined();
    await moduleRef.close();
  });
});

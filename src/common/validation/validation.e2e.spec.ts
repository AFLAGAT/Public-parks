// src/common/validation/validation.e2e.spec.ts
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Body, Controller, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import { LoggingModule } from '../logging/logging.module';
import { CORRELATION_ID_HEADER } from '../logging/request-correlation.util';
import { ValidationModule } from './validation.module';
import { createZodDto } from './create-zod-dto.util';

const createThingSchema = z
  .object({ name: z.string().min(1), quantity: z.coerce.number().int().positive() })
  .strict();
class CreateThingDto extends createZodDto(createThingSchema) {}

@Controller('things')
class FixtureThingsController {
  @Post()
  create(@Body() body: CreateThingDto): { received: unknown } {
    return { received: body };
  }
}

// Vitest uses esbuild which does not support TypeScript's emitDecoratorMetadata.
// NestJS uses 'design:paramtypes' to resolve the metatype for @Body() parameters.
// We define it explicitly here to simulate what tsc --emitDecoratorMetadata would emit.
Reflect.defineMetadata(
  'design:paramtypes',
  [CreateThingDto],
  FixtureThingsController.prototype,
  'create',
);

describe('validation layer (e2e)', () => {
  const correlationId = '01975db7-3a5f-7b8c-9d10-111213141516';
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggingModule, ValidationModule],
      controllers: [FixtureThingsController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
    // Normalize IPv6/wildcard addresses that fetch() cannot resolve
    baseUrl = baseUrl.replace('[::1]', '127.0.0.1').replace('0.0.0.0', '127.0.0.1');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('accepts valid input and returns coerced data', async () => {
    const res = await fetch(`${baseUrl}/things`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'court a', quantity: '2' }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ received: { name: 'court a', quantity: 2 } });
  });

  it('rejects an unknown field with the canonical 400 envelope', async () => {
    const res = await fetch(`${baseUrl}/things`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CORRELATION_ID_HEADER]: correlationId,
      },
      body: JSON.stringify({ name: 'court a', quantity: 2, sneaky: true }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: unknown; correlationId: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error).toHaveProperty('details');
    expect(body.error.correlationId).toBe(correlationId);
    expect(res.headers.get(CORRELATION_ID_HEADER)).toBe(correlationId);
  });

  it('rejects an invalid field value with 400', async () => {
    const res = await fetch(`${baseUrl}/things`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', quantity: -1 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: Record<string, unknown> } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(body.error.details).length).toBeGreaterThan(0);
  });
});

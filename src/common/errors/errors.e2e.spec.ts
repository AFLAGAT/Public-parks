import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggingModule } from '../logging/logging.module';
import { CORRELATION_ID_HEADER } from '../logging/request-correlation.util';
import { ErrorsModule } from './errors.module';
import { ApplicationException } from './application.exception';
import { ErrorCode } from './error-codes';

@Controller('boom')
class FixtureBoomController {
  @Get('application')
  throwApplication(): never {
    throw new ApplicationException(ErrorCode.RESOURCE_CONFLICT, 'Court already reserved.', {
      details: { courtId: 'court-1' },
    });
  }

  @Get('framework')
  throwFramework(): never {
    throw new NotFoundException('missing');
  }

  @Get('unknown')
  throwUnknown(): never {
    throw new Error('internal secret detail that must not leak');
  }
}

describe('centralized error handling (e2e)', () => {
  const correlationId = '01975db7-3a5f-7b8c-9d10-111213141516';
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggingModule, ErrorsModule],
      controllers: [FixtureBoomController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1').replace('0.0.0.0', '127.0.0.1');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('renders an ApplicationException as the canonical envelope with correlation id', async () => {
    const res = await fetch(`${baseUrl}/boom/application`, {
      headers: { [CORRELATION_ID_HEADER]: correlationId },
    });
    expect(res.status).toBe(409);
    expect(res.headers.get(CORRELATION_ID_HEADER)).toBe(correlationId);
    expect(await res.json()).toEqual({
      error: {
        code: ErrorCode.RESOURCE_CONFLICT,
        message: 'Court already reserved.',
        details: { courtId: 'court-1' },
        correlationId,
      },
    });
  });

  it('maps a framework HttpException to a stable catalog code', async () => {
    const res = await fetch(`${baseUrl}/boom/framework`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; details: unknown } };
    expect(body.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    expect(body.error.details).toBeNull();
  });

  it('renders an unexpected error as 500 without leaking internal detail', async () => {
    const res = await fetch(`${baseUrl}/boom/unknown`);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(body)).not.toContain('internal secret detail');
  });

  it('returns a generated correlation id when none is supplied', async () => {
    const res = await fetch(`${baseUrl}/boom/framework`);
    const body = (await res.json()) as { error: { correlationId: string } };
    expect(body.error.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

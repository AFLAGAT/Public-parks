import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ErrorsModule } from '../common/errors/errors.module';
import { ErrorCode } from '../common/errors/error-codes';
import { LoggingModule } from '../common/logging/logging.module';
import { CORRELATION_ID_HEADER } from '../common/logging/request-correlation.util';
import { AuthModule } from './auth.module';
import { Public } from './public.decorator';

@Controller('auth-fixture')
class FixtureAuthController {
  @Public()
  @Get('public')
  getPublic(): { access: string } {
    return { access: 'public' };
  }

  @Get('protected')
  getProtected(): { access: string } {
    return { access: 'protected' };
  }
}

describe('authentication middleware skeleton (e2e)', () => {
  const correlationId = '01975db7-3a5f-7b8c-9d10-111213141516';
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggingModule, ErrorsModule, AuthModule],
      controllers: [FixtureAuthController],
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

  it('allows a route only when it is explicitly marked public', async () => {
    const response = await fetch(`${baseUrl}/auth-fixture/public`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ access: 'public' });
  });

  it('denies an unmarked route by default with the canonical error envelope', async () => {
    const response = await fetch(`${baseUrl}/auth-fixture/protected`, {
      headers: { [CORRELATION_ID_HEADER]: correlationId },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe(correlationId);
    expect(await response.json()).toEqual({
      error: {
        code: ErrorCode.AUTHENTICATION_REQUIRED,
        message: 'Authentication is required.',
        details: null,
        correlationId,
      },
    });
  });

  it('rejects an arbitrary bearer token during verification', async () => {
    const response = await fetch(`${baseUrl}/auth-fixture/protected`, {
      headers: { authorization: 'Bearer attacker-controlled-token' },
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCode.AUTHENTICATION_FAILED);
  });
});

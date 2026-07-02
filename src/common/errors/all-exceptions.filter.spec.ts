import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApplicationException } from './application.exception';
import { ErrorCode } from './error-codes';
import { RequestValidationException } from '../validation/request-validation.exception';

const CORRELATION_ID = '01975db7-3a5f-7b8c-9d10-111213141516';

function mockLogger() {
  const error = vi.fn();
  const setContext = vi.fn();
  const logger = { setContext, error } as unknown as PinoLogger;
  return { logger, error };
}

function mockHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: CORRELATION_ID }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  it('renders RequestValidationException as the canonical 400 VALIDATION_FAILED envelope', () => {
    const { logger, error } = mockLogger();
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = mockHost();
    const details = { name: ['Required'] };

    filter.catch(new RequestValidationException(details), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Request validation failed.',
        details,
        correlationId: CORRELATION_ID,
      },
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('renders an ApplicationException with its code, status, and client-safe details', () => {
    const { logger, error } = mockLogger();
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = mockHost();

    filter.catch(
      new ApplicationException(ErrorCode.RESOURCE_CONFLICT, 'Court already reserved.', {
        details: { courtId: 'abc' },
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.RESOURCE_CONFLICT,
        message: 'Court already reserved.',
        details: { courtId: 'abc' },
        correlationId: CORRELATION_ID,
      },
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('maps a framework HttpException status to a stable catalog code', () => {
    const { logger, error } = mockLogger();
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = mockHost();

    filter.catch(new ForbiddenException('Nope'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.PERMISSION_DENIED,
        message: 'Nope',
        details: null,
        correlationId: CORRELATION_ID,
      },
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('collapses a framework 5xx HttpException to a generic message and logs it', () => {
    const { logger, error } = mockLogger();
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = mockHost();

    filter.catch(
      new HttpException('leaky internal detail', HttpStatus.INTERNAL_SERVER_ERROR),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred.',
        details: null,
        correlationId: CORRELATION_ID,
      },
    });
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('renders an unknown thrown value as 500 INTERNAL_ERROR without leaking detail and logs it', () => {
    const { logger, error } = mockLogger();
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = mockHost();

    filter.catch(new Error('secret database connection string failed'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred.',
        details: null,
        correlationId: CORRELATION_ID,
      },
    });
    const [[logPayload]] = (error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(logPayload).toMatchObject({ errorCode: ErrorCode.INTERNAL_ERROR });
  });
});

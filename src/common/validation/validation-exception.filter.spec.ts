import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { ValidationExceptionFilter } from './validation-exception.filter';
import { RequestValidationException } from './request-validation.exception';

const CORRELATION_ID = '01975db7-3a5f-7b8c-9d10-111213141516';

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

describe('ValidationExceptionFilter', () => {
  const filter = new ValidationExceptionFilter();

  it('renders the canonical error envelope with 400', () => {
    const { host, status, json } = mockHost();
    const details = { name: ['Required'] };

    filter.catch(new RequestValidationException(details), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details,
        correlationId: CORRELATION_ID,
      },
    });
  });
});

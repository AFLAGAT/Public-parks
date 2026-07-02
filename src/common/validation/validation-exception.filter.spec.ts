import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import {
  CORRELATION_ID_PLACEHOLDER,
  ValidationExceptionFilter,
} from './validation-exception.filter';
import { RequestValidationException } from './request-validation.exception';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
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
        correlationId: CORRELATION_ID_PLACEHOLDER,
      },
    });
  });
});

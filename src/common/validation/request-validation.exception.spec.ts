import { describe, expect, it } from 'vitest';
import { RequestValidationException } from './request-validation.exception';

describe('RequestValidationException', () => {
  it('carries a stable code, message, and structured details', () => {
    const details = { quantity: ['Expected a positive integer'] };
    const error = new RequestValidationException(details);

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Request validation failed.');
    expect(error.details).toEqual(details);
    expect(error.name).toBe('RequestValidationException');
  });
});

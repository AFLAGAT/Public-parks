import { describe, expect, it } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { ApplicationException } from './application.exception';
import { ErrorCode } from './error-codes';

describe('ApplicationException', () => {
  it('derives its HTTP status from the code by default', () => {
    const exception = new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, 'Facility not found.');
    expect(exception.httpStatus).toBe(HttpStatus.NOT_FOUND);
    expect(exception.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    expect(exception.details).toBeUndefined();
    expect(exception).toBeInstanceOf(Error);
  });

  it('allows an explicit status override and carries client-safe details', () => {
    const exception = new ApplicationException(ErrorCode.REQUEST_REJECTED, 'Rejected.', {
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details: { field: 'quantity' },
    });
    expect(exception.httpStatus).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(exception.details).toEqual({ field: 'quantity' });
  });

  it('preserves an underlying cause without exposing it as details', () => {
    const cause = new Error('root cause');
    const exception = new ApplicationException(ErrorCode.INTERNAL_ERROR, 'Boom.', { cause });
    expect(exception.cause).toBe(cause);
    expect(exception.details).toBeUndefined();
  });
});

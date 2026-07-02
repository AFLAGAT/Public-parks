import { describe, expect, it } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { ERROR_CODE_HTTP_STATUS, ErrorCode, mapHttpStatusToErrorCode } from './error-codes';

describe('error-codes', () => {
  it('has a default HTTP status for every catalog code', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ERROR_CODE_HTTP_STATUS[code]).toBeTypeOf('number');
    }
  });

  it('maps common statuses to their stable codes', () => {
    expect(mapHttpStatusToErrorCode(HttpStatus.UNAUTHORIZED)).toBe(ErrorCode.AUTHENTICATION_REQUIRED);
    expect(mapHttpStatusToErrorCode(HttpStatus.FORBIDDEN)).toBe(ErrorCode.PERMISSION_DENIED);
    expect(mapHttpStatusToErrorCode(HttpStatus.NOT_FOUND)).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    expect(mapHttpStatusToErrorCode(HttpStatus.CONFLICT)).toBe(ErrorCode.RESOURCE_CONFLICT);
    expect(mapHttpStatusToErrorCode(HttpStatus.TOO_MANY_REQUESTS)).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
  });

  it('collapses unmapped 5xx to INTERNAL_ERROR and unmapped 4xx to REQUEST_REJECTED', () => {
    expect(mapHttpStatusToErrorCode(HttpStatus.BAD_GATEWAY)).toBe(ErrorCode.INTERNAL_ERROR);
    expect(mapHttpStatusToErrorCode(HttpStatus.I_AM_A_TEAPOT)).toBe(ErrorCode.REQUEST_REJECTED);
  });
});

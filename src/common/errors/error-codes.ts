import { HttpStatus } from '@nestjs/common';

/**
 * Stable client-facing error codes. Per DECISIONS.md ("API error response
 * shape") a `code` is a stable string enum a client can branch on regardless of
 * HTTP status, wording, or locale — it is NOT a mirror of the HTTP status name.
 * Codes are UPPER_SNAKE_CASE per NamingConventions.md §4 (Error Responses).
 *
 * This catalog is the foundational taxonomy referenced by centralized error
 * handling. Domain-specific codes (e.g. ENTRANCE_CAPACITY_EXHAUSTED) are added
 * by the slice that owns them, extending — never renaming — the entries here.
 */
export const ErrorCode = {
  // Client input / request-shape failures (4xx)
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  REQUEST_REJECTED: 'REQUEST_REJECTED',
  // Authentication / authorization (4xx)
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  // Resource / conflict (4xx)
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  // Server / infrastructure (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SMS_DELIVERY_UNAVAILABLE: 'SMS_DELIVERY_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const HTTP_SERVER_ERROR_MIN_STATUS = 500;

/** True for any HTTP status in the 5xx range (server/infrastructure failure). */
export function isServerErrorStatus(httpStatus: number): boolean {
  return httpStatus >= HTTP_SERVER_ERROR_MIN_STATUS;
}

/**
 * Default HTTP status for each error code. An ApplicationException may override
 * its status explicitly, but this table is the authoritative default so callers
 * that pass only a code get a correct status without repeating themselves.
 */
export const ERROR_CODE_HTTP_STATUS: Readonly<Record<ErrorCode, HttpStatus>> = {
  [ErrorCode.VALIDATION_FAILED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.MALFORMED_REQUEST]: HttpStatus.BAD_REQUEST,
  [ErrorCode.REQUEST_REJECTED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.AUTHENTICATION_REQUIRED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.AUTHENTICATION_FAILED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [ErrorCode.RESOURCE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.METHOD_NOT_ALLOWED]: HttpStatus.METHOD_NOT_ALLOWED,
  [ErrorCode.RESOURCE_CONFLICT]: HttpStatus.CONFLICT,
  [ErrorCode.PAYLOAD_TOO_LARGE]: HttpStatus.PAYLOAD_TOO_LARGE,
  [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  [ErrorCode.UNPROCESSABLE_ENTITY]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.SERVICE_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.SMS_DELIVERY_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
};

/**
 * Lookup of the specific HTTP statuses a framework HttpException realistically
 * carries, to their stable catalog code. Anything not listed falls back by
 * range in mapHttpStatusToErrorCode.
 */
const HTTP_STATUS_ERROR_CODE: Readonly<Partial<Record<number, ErrorCode>>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.MALFORMED_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.AUTHENTICATION_REQUIRED,
  [HttpStatus.FORBIDDEN]: ErrorCode.PERMISSION_DENIED,
  [HttpStatus.NOT_FOUND]: ErrorCode.RESOURCE_NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: ErrorCode.METHOD_NOT_ALLOWED,
  [HttpStatus.CONFLICT]: ErrorCode.RESOURCE_CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.UNPROCESSABLE_ENTITY,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMIT_EXCEEDED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

/**
 * Maps a raw HTTP status (e.g. from a framework-thrown HttpException that did
 * not originate as an ApplicationException) to a stable catalog code. Unmapped
 * 5xx collapse to INTERNAL_ERROR; unmapped 4xx collapse to REQUEST_REJECTED so
 * a client always receives a code from this catalog, never a bare status.
 */
export function mapHttpStatusToErrorCode(httpStatus: number): ErrorCode {
  const mapped = HTTP_STATUS_ERROR_CODE[httpStatus];
  if (mapped) {
    return mapped;
  }
  return isServerErrorStatus(httpStatus)
    ? ErrorCode.INTERNAL_ERROR
    : ErrorCode.REQUEST_REJECTED;
}

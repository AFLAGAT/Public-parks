import { ERROR_CODE_HTTP_STATUS, type ErrorCode } from './error-codes';

/**
 * Optional structured detail payload attached to an error. Rendered under
 * `error.details` in the canonical envelope. Keep this to safe, client-usable
 * data — never provider secrets, stack traces, or internal identifiers.
 */
export type ErrorDetails = Record<string, unknown>;

export interface ApplicationExceptionOptions {
  /** Override the catalog default HTTP status for this code. */
  readonly httpStatus?: number;
  /** Client-safe structured detail rendered under `error.details`. */
  readonly details?: ErrorDetails;
  /** Underlying error preserved for server-side logging, never sent to clients. */
  readonly cause?: unknown;
}

/**
 * Base class for all deliberately-thrown, client-facing application errors.
 * Business and domain layers throw subclasses (or this class directly) instead
 * of framework HttpExceptions so error identity is a stable catalog code, not an
 * HTTP status. The AllExceptionsFilter maps these to the canonical envelope.
 *
 * The HTTP status is derived from the code by default (see
 * ERROR_CODE_HTTP_STATUS) and only overridden when a code legitimately maps to
 * more than one status.
 */
export class ApplicationException extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: ErrorDetails;

  constructor(code: ErrorCode, message: string, options: ApplicationExceptionOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = options.httpStatus ?? ERROR_CODE_HTTP_STATUS[code];
    this.details = options.details;
  }
}

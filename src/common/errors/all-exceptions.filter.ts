import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { getRequestCorrelationId } from '../logging/request-correlation.util';
import { RequestValidationException } from '../validation/request-validation.exception';
import { ApplicationException, ErrorDetails } from './application.exception';
import { ErrorCode, isServerErrorStatus, mapHttpStatusToErrorCode } from './error-codes';

/**
 * Minimal structural type for the HTTP response object. The filter only needs
 * `.status().json()`, so we type exactly that rather than depending on
 * `@types/express` — keeping the "no new dependency" constraint intact.
 */
interface HttpResponseLike {
  status(code: number): { json(body: unknown): void };
}

/** Generic message for any 5xx so internal failure detail never reaches clients. */
const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred.';

interface MappedError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly httpStatus: number;
  readonly details: ErrorDetails | null;
}

/**
 * Single global exception filter. It owns the canonical error envelope
 * `{ error: { code, message, details, correlationId } }` (DECISIONS.md "API
 * error response shape"; NamingConventions.md §4) for every failure that
 * reaches the framework:
 *
 * - RequestValidationException  → 400 VALIDATION_FAILED with field details
 * - ApplicationException        → its catalog code + status + client-safe details
 * - HttpException (framework)   → status mapped to a stable catalog code
 * - anything else               → 500 INTERNAL_ERROR, no internal leakage
 *
 * 5xx responses are logged at error level with the underlying error (and stack)
 * because the client only ever sees a generic message. 4xx are expected client
 * errors and are left to pino-http's status-aware request log.
 *
 * This is intentionally the ONLY exception filter: NestJS selects a filter with
 * a first-match search over a reversed registration list, which makes a
 * catch-all coexisting with type-specific filters order-fragile. Owning every
 * case here keeps rendering deterministic.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  // @Inject is explicit because Vitest/esbuild does not emit the decorator
  // metadata NestJS otherwise uses to resolve the PinoLogger constructor type.
  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ readonly id?: unknown }>();
    const response = http.getResponse<HttpResponseLike>();
    const correlationId = getRequestCorrelationId(request);

    const mapped = this.mapException(exception);

    if (isServerErrorStatus(mapped.httpStatus)) {
      this.logger.error(
        { error: exception, correlationId, errorCode: mapped.code },
        'unhandled exception rendered by AllExceptionsFilter',
      );
    }

    response.status(mapped.httpStatus).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        details: mapped.details,
        correlationId,
      },
    });
  }

  private mapException(exception: unknown): MappedError {
    if (exception instanceof RequestValidationException) {
      return {
        code: exception.code,
        message: exception.message,
        httpStatus: HttpStatus.BAD_REQUEST,
        details: exception.details,
      };
    }

    if (exception instanceof ApplicationException) {
      return {
        code: exception.code,
        message: exception.message,
        httpStatus: exception.httpStatus,
        details: exception.details ?? null,
      };
    }

    if (exception instanceof HttpException) {
      const httpStatus = exception.getStatus();
      const isServerError = isServerErrorStatus(httpStatus);
      return {
        code: mapHttpStatusToErrorCode(httpStatus),
        // Framework 5xx (e.g. ServiceUnavailable, InternalServerError) may carry
        // internal wording — collapse to the generic message; 4xx wording is
        // client-directed and safe to surface.
        message: isServerError ? INTERNAL_ERROR_MESSAGE : exception.message,
        httpStatus,
        details: null,
      };
    }

    return {
      code: ErrorCode.INTERNAL_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      details: null,
    };
  }
}

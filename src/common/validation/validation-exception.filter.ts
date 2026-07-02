import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { RequestValidationException } from './request-validation.exception';

/**
 * Temporary correlation id until the structured-logging item wires a real
 * per-request id into the envelope. Referenced here so the field is present and
 * clients can rely on its shape from day one.
 */
export const CORRELATION_ID_PLACEHOLDER = 'not-yet-wired';

@Catch(RequestValidationException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: RequestValidationException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.BAD_REQUEST).json({
      error: {
        code: exception.code,
        message: exception.message,
        details: exception.details,
        correlationId: CORRELATION_ID_PLACEHOLDER,
      },
    });
  }
}

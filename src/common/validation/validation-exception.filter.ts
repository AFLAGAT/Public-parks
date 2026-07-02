import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { RequestValidationException } from './request-validation.exception';

/**
 * Minimal structural type for the HTTP response object. The filter only needs
 * `.status().json()`, so we type exactly that rather than depending on
 * `@types/express` — keeping the "no new dependency" constraint intact.
 */
interface HttpResponseLike {
  status(code: number): { json(body: unknown): void };
}

/**
 * Temporary correlation id until the structured-logging item wires a real
 * per-request id into the envelope. Referenced here so the field is present and
 * clients can rely on its shape from day one.
 */
export const CORRELATION_ID_PLACEHOLDER = 'not-yet-wired';

@Catch(RequestValidationException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: RequestValidationException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponseLike>();
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

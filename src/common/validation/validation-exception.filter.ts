import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { getRequestCorrelationId } from '../logging/request-correlation.util';
import { RequestValidationException } from './request-validation.exception';

/**
 * Minimal structural type for the HTTP response object. The filter only needs
 * `.status().json()`, so we type exactly that rather than depending on
 * `@types/express` — keeping the "no new dependency" constraint intact.
 */
interface HttpResponseLike {
  status(code: number): { json(body: unknown): void };
}

@Catch(RequestValidationException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: RequestValidationException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ readonly id?: unknown }>();
    const response = http.getResponse<HttpResponseLike>();
    response.status(HttpStatus.BAD_REQUEST).json({
      error: {
        code: exception.code,
        message: exception.message,
        details: exception.details,
        correlationId: getRequestCorrelationId(request),
      },
    });
  }
}

import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CorrelationRequest = Pick<IncomingMessage, 'headers'>;
type CorrelationResponse = Pick<ServerResponse, 'setHeader'>;

/**
 * Reuses a caller-provided UUID correlation ID or creates a new UUID when the
 * header is missing or malformed. Restricting accepted values to UUIDs keeps
 * untrusted header content out of log fields.
 */
export function createRequestCorrelationId(
  request: CorrelationRequest,
  response: CorrelationResponse,
): string {
  const incomingValue = request.headers[CORRELATION_ID_HEADER];
  const correlationId =
    typeof incomingValue === 'string' && UUID_PATTERN.test(incomingValue)
      ? incomingValue.toLowerCase()
      : randomUUID();

  response.setHeader(CORRELATION_ID_HEADER, correlationId);
  return correlationId;
}

/**
 * Reads the correlation ID assigned by pino-http. The fallback protects error
 * rendering in isolated tests or unusual bootstrap failures where middleware
 * did not run; normal application requests always take the assigned-ID path.
 */
export function getRequestCorrelationId(request: { readonly id?: unknown }): string {
  return typeof request.id === 'string' && UUID_PATTERN.test(request.id)
    ? request.id.toLowerCase()
    : randomUUID();
}

import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';
import {
  CORRELATION_ID_HEADER,
  createRequestCorrelationId,
  getRequestCorrelationId,
} from './request-correlation.util';

const VALID_CORRELATION_ID = '01975db7-3a5f-7b8c-9d10-111213141516';

function createResponse() {
  const setHeader = vi.fn();
  return {
    response: { setHeader } as unknown as ServerResponse,
    setHeader,
  };
}

describe('request correlation', () => {
  it('preserves a valid incoming UUID and returns it in the response header', () => {
    const request = {
      headers: { [CORRELATION_ID_HEADER]: VALID_CORRELATION_ID.toUpperCase() },
    } as unknown as IncomingMessage;
    const { response, setHeader } = createResponse();

    expect(createRequestCorrelationId(request, response)).toBe(VALID_CORRELATION_ID);
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, VALID_CORRELATION_ID);
  });

  it('replaces malformed untrusted header content with a generated UUID', () => {
    const request = {
      headers: { [CORRELATION_ID_HEADER]: 'attacker\ncontrolled' },
    } as unknown as IncomingMessage;
    const { response, setHeader } = createResponse();

    const correlationId = createRequestCorrelationId(request, response);

    expect(correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(correlationId).not.toContain('attacker');
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, correlationId);
  });

  it('reads the request ID assigned by pino-http', () => {
    expect(getRequestCorrelationId({ id: VALID_CORRELATION_ID })).toBe(VALID_CORRELATION_ID);
  });
});

import type { IncomingMessage, ServerResponse } from 'http';
import pino, { type DestinationStream } from 'pino';
import { describe, expect, it } from 'vitest';
import {
  createPinoHttpOptions,
  REDACTED_LOG_VALUE,
} from './structured-logging.config';

type Serializer = (value: unknown) => unknown;

describe('structured logging configuration', () => {
  it('serializes only operational request metadata and drops query strings', () => {
    const options = createPinoHttpOptions('info', 'test');
    const serializeRequest = options.serializers?.httpRequest as Serializer;
    const request = {
      method: 'GET',
      url: '/v1/facilities?accessToken=must-not-log',
      headers: { authorization: 'Bearer must-not-log' },
      body: { password: 'must-not-log' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as IncomingMessage;

    expect(serializeRequest(request)).toEqual({
      method: 'GET',
      path: '/v1/facilities',
    });
  });

  it('uses warning and error levels for unsuccessful responses', () => {
    const options = createPinoHttpOptions('info', 'test');
    const request = {} as IncomingMessage;

    expect(options.customLogLevel?.(request, { statusCode: 404 } as ServerResponse)).toBe(
      'warn',
    );
    expect(options.customLogLevel?.(request, { statusCode: 500 } as ServerResponse)).toBe(
      'error',
    );
    expect(options.customLogLevel?.(request, { statusCode: 204 } as ServerResponse)).toBe(
      'info',
    );
  });

  it('redacts secrets and unnecessary personal data at multiple object depths', () => {
    const options = createPinoHttpOptions('info', 'test');
    const lines: string[] = [];
    const destination: DestinationStream = {
      write: (line: string) => {
        lines.push(line);
        return true;
      },
    };
    const logger = pino(
      {
        level: options.level,
        base: undefined,
        timestamp: false,
        redact: options.redact,
        formatters: options.formatters,
      },
      destination,
    );

    logger.info(
      {
        password: 'resident-password',
        auth: { accessToken: 'access-token' },
        payment: { provider: { paymentSecret: 'payment-secret' } },
        resident: {
          profile: {
            contact: {
              private: {
                phoneNumber: '+251900000000',
                sessions: [{ refreshToken: 'refresh-token' }],
              },
            },
          },
        },
        paymentId: 'safe-operational-id',
      },
      'redaction test',
    );

    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry.password).toBe(REDACTED_LOG_VALUE);
    expect(entry.auth).toEqual({ accessToken: REDACTED_LOG_VALUE });
    expect(entry.payment).toEqual({
      provider: { paymentSecret: REDACTED_LOG_VALUE },
    });
    expect(entry.resident).toEqual({
      profile: {
        contact: {
          private: {
            phoneNumber: REDACTED_LOG_VALUE,
            sessions: [{ refreshToken: REDACTED_LOG_VALUE }],
          },
        },
      },
    });
    expect(entry.paymentId).toBe('safe-operational-id');
    expect(lines[0]).not.toContain('resident-password');
    expect(lines[0]).not.toContain('access-token');
    expect(lines[0]).not.toContain('+251900000000');
    expect(lines[0]).not.toContain('refresh-token');
  });
});

import type { IncomingMessage, ServerResponse } from 'http';
import pino from 'pino';
import type { Options as PinoHttpOptions } from 'pino-http';
import type { AppNodeEnv, Env } from '../../config/env.schema';
import { createRequestCorrelationId } from './request-correlation.util';

export const REDACTED_LOG_VALUE = '[REDACTED]';

const SENSITIVE_FIELD_NAMES = [
  'accessToken',
  'address',
  'authorization',
  'cookie',
  'email',
  'firstName',
  'fullName',
  'jwt',
  'lastName',
  'nationalId',
  'otp',
  'otpCode',
  'password',
  'paymentSecret',
  'phoneNumber',
  'qrSecret',
  'refreshToken',
  'telebirrAppSecret',
  'telebirrRsaPrivateKey',
  'token',
] as const;

const SENSITIVE_FIELD_NAME_SET = new Set<string>(SENSITIVE_FIELD_NAMES);

const SENSITIVE_LOG_PATHS = [
  'req.headers',
  'res.headers',
  'request.headers',
  'response.headers',
  'httpRequest.headers',
  'httpResponse.headers',
  ...SENSITIVE_FIELD_NAMES.flatMap((fieldName) => [
    fieldName,
    `*.${fieldName}`,
    `*.*.${fieldName}`,
    `*.*.*.${fieldName}`,
  ]),
];

function redactSensitiveValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing) {
      return existing;
    }
    const redactedArray: unknown[] = [];
    seen.set(value, redactedArray);
    for (const entry of value) {
      redactedArray.push(redactSensitiveValue(entry, seen));
    }
    return redactedArray;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  const existing = seen.get(value);
  if (existing) {
    return existing;
  }

  const redactedObject: Record<string, unknown> = {};
  seen.set(value, redactedObject);
  for (const [key, nestedValue] of Object.entries(value)) {
    redactedObject[key] = SENSITIVE_FIELD_NAME_SET.has(key)
      ? REDACTED_LOG_VALUE
      : redactSensitiveValue(nestedValue, seen);
  }
  return redactedObject;
}

function redactSensitiveLogObject(object: Record<string, unknown>): Record<string, unknown> {
  return redactSensitiveValue(object, new WeakMap()) as Record<string, unknown>;
}

function getRequestPath(url: string | undefined): string {
  if (!url) {
    return '/';
  }
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

function serializeHttpRequest(request: IncomingMessage): {
  method: string | undefined;
  path: string;
} {
  return {
    method: request.method,
    path: getRequestPath(request.url),
  };
}

function serializeHttpResponse(response: ServerResponse): { statusCode: number } {
  return { statusCode: response.statusCode };
}

export function createPinoHttpOptions(
  logLevel: Env['LOG_LEVEL'],
  nodeEnv: AppNodeEnv,
): PinoHttpOptions {
  return {
    level: logLevel,
    base: {
      service: 'public-parks-backend',
      environment: nodeEnv,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      log: redactSensitiveLogObject,
    },
    redact: {
      paths: SENSITIVE_LOG_PATHS,
      censor: REDACTED_LOG_VALUE,
    },
    genReqId: createRequestCorrelationId,
    quietReqLogger: true,
    wrapSerializers: false,
    serializers: {
      httpRequest: serializeHttpRequest,
      httpResponse: serializeHttpResponse,
      error: pino.stdSerializers.err,
    },
    customAttributeKeys: {
      req: 'httpRequest',
      res: 'httpResponse',
      err: 'error',
      reqId: 'correlationId',
      responseTime: 'durationMs',
    },
    customLogLevel: (_request, response, error) => {
      if (error || response.statusCode >= 500) {
        return 'error';
      }
      if (response.statusCode >= 400) {
        return 'warn';
      }
      return 'info';
    },
    customSuccessMessage: () => 'request completed',
    customErrorMessage: () => 'request failed',
  };
}

import { z } from 'zod';
import { RequestValidationException } from '../validation/request-validation.exception';
import { MAX_CURSOR_LENGTH } from './pagination.constants';
import { paginationCursorSchema } from './pagination-query.schema';
import type { CursorPayload } from './pagination.types';

const CURSOR_VERSION = 1;
const MALFORMED_CURSOR_MESSAGE = 'Cursor is malformed or incompatible with this endpoint.';

const cursorScalarSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const cursorPayloadSchema = z
  .record(cursorScalarSchema)
  .refine((payload) => Object.keys(payload).length > 0, 'Cursor payload cannot be empty.');

const cursorEnvelopeSchema = z
  .object({
    v: z.literal(CURSOR_VERSION),
    p: cursorPayloadSchema,
  })
  .strict();

function throwMalformedCursor(): never {
  throw new RequestValidationException({ cursor: [MALFORMED_CURSOR_MESSAGE] });
}

/** Encodes a small scalar-only keyset as an opaque, versioned Base64URL cursor. */
export function encodePaginationCursor(payload: CursorPayload): string {
  const parsedPayload = cursorPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    throw new TypeError('Pagination cursor payload must be a non-empty scalar record.');
  }

  const encoded = Buffer.from(
    JSON.stringify({ v: CURSOR_VERSION, p: parsedPayload.data }),
    'utf8',
  ).toString('base64url');

  if (encoded.length > MAX_CURSOR_LENGTH) {
    throw new RangeError(`Pagination cursor cannot exceed ${String(MAX_CURSOR_LENGTH)} characters.`);
  }
  return encoded;
}

/**
 * Decodes a cursor only after its payload passes the endpoint-owned schema.
 * The same opaque string therefore cannot silently acquire meaning on another
 * endpoint or sort order with an incompatible keyset.
 */
export function decodePaginationCursor<T>(cursor: string, payloadSchema: z.ZodType<T>): T {
  if (!paginationCursorSchema.safeParse(cursor).success) {
    return throwMalformedCursor();
  }

  try {
    const decodedBytes = Buffer.from(cursor, 'base64url');
    if (decodedBytes.toString('base64url') !== cursor) {
      return throwMalformedCursor();
    }

    const envelopeResult = cursorEnvelopeSchema.safeParse(
      JSON.parse(decodedBytes.toString('utf8')),
    );
    if (!envelopeResult.success) {
      return throwMalformedCursor();
    }

    const payloadResult = payloadSchema.safeParse(envelopeResult.data.p);
    if (!payloadResult.success) {
      return throwMalformedCursor();
    }
    return payloadResult.data;
  } catch (error) {
    if (error instanceof RequestValidationException) {
      throw error;
    }
    return throwMalformedCursor();
  }
}

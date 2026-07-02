import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RequestValidationException } from '../validation/request-validation.exception';
import { MAX_CURSOR_LENGTH } from './pagination.constants';
import {
  decodePaginationCursor,
  encodePaginationCursor,
} from './pagination-cursor.util';

const facilityCursorSchema = z
  .object({
    distanceMeters: z.number().nonnegative(),
    id: z.string().uuid(),
  })
  .strict();

describe('pagination cursor', () => {
  const payload = {
    distanceMeters: 125.5,
    id: '01975db7-3a5f-7b8c-9d10-111213141516',
  };

  it('round-trips a versioned endpoint keyset through opaque Base64URL', () => {
    const cursor = encodePaginationCursor(payload);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain(payload.id);
    expect(decodePaginationCursor(cursor, facilityCursorSchema)).toEqual(payload);
  });

  it.each([
    '',
    'not+base64url',
    Buffer.from('not json', 'utf8').toString('base64url'),
    Buffer.from(JSON.stringify({ v: 2, p: payload }), 'utf8').toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, p: {} }), 'utf8').toString('base64url'),
  ])('rejects malformed or unsupported cursor %s', (cursor) => {
    expect(() => decodePaginationCursor(cursor, facilityCursorSchema)).toThrow(
      RequestValidationException,
    );
  });

  it('rejects a valid cursor whose keyset belongs to another endpoint or sort', () => {
    const cursor = encodePaginationCursor(payload);
    const incompatibleSchema = z.object({ createdAt: z.string().datetime() }).strict();

    expect(() => decodePaginationCursor(cursor, incompatibleSchema)).toThrow(
      RequestValidationException,
    );
  });

  it('uses a stable field-level validation detail without leaking decoded content', () => {
    try {
      decodePaginationCursor('invalid+cursor', facilityCursorSchema);
      expect.unreachable('Expected malformed cursor rejection.');
    } catch (error) {
      expect(error).toBeInstanceOf(RequestValidationException);
      expect((error as RequestValidationException).details).toEqual({
        cursor: ['Cursor is malformed or incompatible with this endpoint.'],
      });
    }
  });

  it('rejects invalid producer payloads and oversized output', () => {
    expect(() => encodePaginationCursor({})).toThrow(TypeError);
    expect(() => encodePaginationCursor({ value: Number.NaN })).toThrow(TypeError);
    expect(() => encodePaginationCursor({ value: 'x'.repeat(MAX_CURSOR_LENGTH) })).toThrow(
      RangeError,
    );
  });
});

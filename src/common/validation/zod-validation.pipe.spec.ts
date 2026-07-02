import { describe, expect, it } from 'vitest';
import type { ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';
import { RequestValidationException } from './request-validation.exception';
import { createZodDto } from './create-zod-dto.util';

const schema = z
  .object({
    name: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
    kind: z.enum(['pool', 'tennis']),
  })
  .strict();
const Dto = createZodDto(schema);
const meta = (metatype: unknown): ArgumentMetadata =>
  ({ type: 'body', metatype: metatype as ArgumentMetadata['metatype'], data: undefined });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  it('returns parsed, coerced data for valid input', () => {
    const result = pipe.transform({ name: 'a', quantity: '3', kind: 'pool' }, meta(Dto));
    expect(result).toEqual({ name: 'a', quantity: 3, kind: 'pool' });
  });

  it('passes through unchanged when the metatype carries no schema', () => {
    const value = { anything: true };
    expect(pipe.transform(value, meta(Object))).toBe(value);
  });

  it('rejects unknown fields', () => {
    expect(() => pipe.transform({ name: 'a', quantity: 1, kind: 'pool', extra: 1 }, meta(Dto)))
      .toThrow(RequestValidationException);
  });

  it('rejects invalid enum values', () => {
    expect(() => pipe.transform({ name: 'a', quantity: 1, kind: 'soccer' }, meta(Dto)))
      .toThrow(RequestValidationException);
  });

  it('rejects missing required fields and reports the field path', () => {
    try {
      pipe.transform({ quantity: 1, kind: 'pool' }, meta(Dto));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RequestValidationException);
      expect((error as RequestValidationException).details).toHaveProperty('name');
    }
  });
});

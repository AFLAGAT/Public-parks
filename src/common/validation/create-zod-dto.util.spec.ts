import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createZodDto } from './create-zod-dto.util';

describe('createZodDto', () => {
  it('returns a constructable class carrying the schema on a static property', () => {
    const schema = z.object({ name: z.string() }).strict();
    const Dto = createZodDto(schema);

    expect(typeof Dto).toBe('function');
    expect(Dto.zodSchema).toBe(schema);
    expect(new Dto()).toBeInstanceOf(Dto);
  });
});

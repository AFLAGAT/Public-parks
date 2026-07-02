import type { ZodTypeAny } from 'zod';

export interface ZodDtoStatic {
  new (): unknown;
  zodSchema: ZodTypeAny;
}

/**
 * Turns a Zod schema into a class NestJS can use as a route param metatype.
 * The class carries the schema on `zodSchema` so the global ZodValidationPipe
 * can resolve it from `ArgumentMetadata.metatype`. Keeps schemas colocated in
 * `<resource>.types.ts` per NamingConventions.md §3.
 */
export function createZodDto(schema: ZodTypeAny): ZodDtoStatic {
  class ZodDto {
    static zodSchema: ZodTypeAny = schema;
  }
  return ZodDto;
}

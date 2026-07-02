import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodTypeAny } from 'zod';
import { RequestValidationException } from './request-validation.exception';

interface SchemaCarrier {
  zodSchema?: ZodTypeAny;
}

function flattenZodError(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

/**
 * Global pipe. Validates a route argument against the Zod schema carried on its
 * DTO metatype (see createZodDto). Arguments without a schema (plain Object,
 * String, primitives) pass through untouched. On failure throws
 * RequestValidationException, rendered as the canonical envelope by
 * ValidationExceptionFilter.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = (metadata.metatype as SchemaCarrier | undefined)?.zodSchema;
    if (!schema) {
      return value;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new RequestValidationException(flattenZodError(result.error));
    }
    return result.data;
  }
}

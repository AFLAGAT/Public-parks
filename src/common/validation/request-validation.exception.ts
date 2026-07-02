/**
 * Thrown by ZodValidationPipe when request input fails schema validation.
 * Caught and rendered as the canonical error envelope by
 * ValidationExceptionFilter. `details` maps each failing field path (camelCase,
 * dot-joined) to its messages.
 */
export class RequestValidationException extends Error {
  readonly code = 'VALIDATION_FAILED' as const;

  constructor(readonly details: Record<string, string[]>) {
    super('Request validation failed.');
    this.name = 'RequestValidationException';
  }
}

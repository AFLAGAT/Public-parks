import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from './zod-validation.pipe';
import { ValidationExceptionFilter } from './validation-exception.filter';

/**
 * Registers request validation globally: every route argument with a Zod schema
 * (via createZodDto) is validated by ZodValidationPipe, and validation failures
 * are rendered as the canonical error envelope by ValidationExceptionFilter.
 * Imported by AppModule.
 */
@Module({
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ValidationExceptionFilter },
  ],
})
export class ValidationModule {}

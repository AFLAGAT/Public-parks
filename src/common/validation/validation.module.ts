import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Registers request validation globally: every route argument with a Zod schema
 * (via createZodDto) is validated by ZodValidationPipe. Validation failures are
 * thrown as RequestValidationException and rendered as the canonical error
 * envelope by the centralized AllExceptionsFilter (see common/errors) — this
 * module no longer owns an exception filter of its own. Imported by AppModule.
 */
@Module({
  providers: [{ provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class ValidationModule {}

import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * Registers the single global exception filter that renders the canonical error
 * envelope for every failure (validation, application, framework, and
 * unexpected). Imported by AppModule. Depends on LoggingModule (@Global) for the
 * PinoLogger the filter injects to log 5xx failures.
 */
@Module({
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class ErrorsModule {}

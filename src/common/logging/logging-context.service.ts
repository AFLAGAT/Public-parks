import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { StructuredLogContext } from './logging.types';

@Injectable()
export class LoggingContextService {
  constructor(private readonly logger: PinoLogger) {}

  /** Adds approved operational identifiers to all later logs in this request. */
  assignContext(context: StructuredLogContext): void {
    const definedFields = Object.fromEntries(
      Object.entries(context).filter((entry): entry is [string, string] => {
        return typeof entry[1] === 'string';
      }),
    );

    if (Object.keys(definedFields).length > 0) {
      this.logger.assign(definedFields);
    }
  }
}

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ConfigModule } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { LoggingContextService } from './logging-context.service';
import { createPinoHttpOptions } from './structured-logging.config';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: createPinoHttpOptions(
          config.get('LOG_LEVEL', { infer: true }),
          config.get('APP_NODE_ENV', { infer: true }),
        ),
        assignResponse: true,
      }),
    }),
  ],
  providers: [LoggingContextService],
  exports: [LoggingContextService],
})
export class LoggingModule {}

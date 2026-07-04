import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { DatabaseConfigService } from './database-config.service';
import { RedisConfigService } from './redis-config.service';
import { SecurityConfigService } from './security-config.service';
import { validateEnv } from './env.schema';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
  ],
  providers: [
    AppConfigService,
    DatabaseConfigService,
    RedisConfigService,
    SecurityConfigService,
  ],
  exports: [
    AppConfigService,
    DatabaseConfigService,
    RedisConfigService,
    SecurityConfigService,
  ],
})
export class ConfigModule {}

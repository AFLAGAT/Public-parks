import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessTokenGuard } from './access-token.guard';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationGuard } from './authentication.guard';
import { AuthenticationRepository } from './authentication.repository';
import { AuthenticationService } from './authentication.service';
import { JwtTokenService } from './jwt-token.service';
import { PermissionsGuard } from './permissions.guard';
import { RateLimitService } from './rate-limit.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { DatabaseModule } from '../database/drizzle.module';
import { SecurityModule } from '../common/security/security.module';
import { RedisModule } from '../common/redis/redis.module';

@Module({
  imports: [DatabaseModule, SecurityModule, RedisModule, NotificationsModule],
  controllers: [AuthenticationController],
  providers: [
    AuthenticationRepository,
    AuthenticationService,
    JwtTokenService,
    RateLimitService,
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [AuthenticationRepository, JwtTokenService],
})
export class AuthModule {}

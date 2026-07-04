import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { DevelopmentSmsInboxController } from './development-sms-inbox.controller';
import { DevelopmentSmsInboxGuard } from './development-sms-inbox.guard';
import { MockSmsProvider } from './mock-sms.provider';
import { OTP_DELIVERY_PORT } from './otp-delivery.port';
import { SmsConfigurationController } from './sms-configuration.controller';
import { SmsConfigurationRepository } from './sms-configuration.repository';
import { SmsConfigurationResolver } from './sms-configuration.resolver';
import { SmsConfigurationService } from './sms-configuration.service';
import { SmsDispatcher } from './sms-dispatcher';
import { SmsOtpDeliveryAdapter } from './sms-otp-delivery.adapter';
import { SmsProviderRegistry } from './sms-provider.registry';
import { DatabaseModule } from '../database/drizzle.module';
import { SecurityModule } from '../common/security/security.module';
import { AppConfigService } from '../config/app-config.service';

const developmentControllers =
  process.env.APP_NODE_ENV === 'development'
    ? [DevelopmentSmsInboxController]
    : [];

@Module({
  imports: [DatabaseModule, SecurityModule, AuditLogsModule],
  controllers: [SmsConfigurationController, ...developmentControllers],
  providers: [
    MockSmsProvider,
    DevelopmentSmsInboxGuard,
    SmsConfigurationRepository,
    SmsConfigurationResolver,
    SmsConfigurationService,
    SmsDispatcher,
    SmsOtpDeliveryAdapter,
    {
      provide: SmsProviderRegistry,
      inject: [MockSmsProvider, AppConfigService],
      useFactory: (
        mockProvider: MockSmsProvider,
        appConfig: AppConfigService,
      ) =>
        new SmsProviderRegistry(
          appConfig.isDevelopment || appConfig.isTest ? [mockProvider] : [],
        ),
    },
    {
      provide: OTP_DELIVERY_PORT,
      useExisting: SmsOtpDeliveryAdapter,
    },
  ],
  exports: [OTP_DELIVERY_PORT, SmsConfigurationResolver, SmsProviderRegistry],
})
export class NotificationsModule {}

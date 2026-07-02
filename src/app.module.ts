import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { LoggingModule } from './common/logging/logging.module';
import { ErrorsModule } from './common/errors/errors.module';
import { ValidationModule } from './common/validation/validation.module';
import { DatabaseModule } from './database/drizzle.module';
import { AuthModule } from './auth/auth.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { SlotBookingModule } from './slot-booking/slot-booking.module';
import { EntranceTicketingModule } from './entrance-ticketing/entrance-ticketing.module';
import { PaymentsModule } from './payments/payments.module';
import { QrModule } from './qr/qr.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminAnalyticsModule } from './admin-analytics/admin-analytics.module';
import { SyncModule } from './sync/sync.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { DocsModule } from './docs/docs.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    ErrorsModule,
    ValidationModule,
    DatabaseModule,
    AuthModule,
    FacilitiesModule,
    SlotBookingModule,
    EntranceTicketingModule,
    PaymentsModule,
    QrModule,
    NotificationsModule,
    AdminAnalyticsModule,
    SyncModule,
    AuditLogsModule,
    DocsModule,
  ],
})
export class AppModule {}

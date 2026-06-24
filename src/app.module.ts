import { Module } from '@nestjs/common';
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

@Module({
  imports: [
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
  ],
})
export class AppModule {}

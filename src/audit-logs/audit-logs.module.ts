import { Module } from '@nestjs/common';
import { AuditLogsRepository } from './audit-logs.repository';

@Module({
  providers: [AuditLogsRepository],
  exports: [AuditLogsRepository],
})
export class AuditLogsModule {}

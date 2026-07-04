import { Inject, Injectable } from '@nestjs/common';
import {
  DRIZZLE_CLIENT,
  type DrizzleClient,
} from '../database/drizzle.module';
import { auditLogs } from '../database/drizzle.schema';
import type { AppendAuditLogRequest } from './audit-logs.types';

type AuditInsertDatabase = Pick<DrizzleClient, 'insert'>;

@Injectable()
export class AuditLogsRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly database: DrizzleClient,
  ) {}

  async appendAuditLog(
    request: AppendAuditLogRequest,
    database: AuditInsertDatabase = this.database,
  ): Promise<void> {
    await database.insert(auditLogs).values({
      actorType: request.actorType,
      actorId: request.actorId,
      action: request.action,
      targetType: request.targetType,
      targetId: request.targetId,
      correlationId: request.correlationId,
      requestIpHash: request.requestIpHash,
      metadata: request.metadata ?? {},
    });
  }
}

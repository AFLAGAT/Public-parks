export type AuditActorType = 'resident' | 'staff' | 'admin' | 'system';

export interface AppendAuditLogRequest {
  readonly actorType: AuditActorType;
  readonly actorId?: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId?: string;
  readonly correlationId?: string;
  readonly requestIpHash?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

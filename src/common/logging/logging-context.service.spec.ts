import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { LoggingContextService } from './logging-context.service';

describe('LoggingContextService', () => {
  it('assigns approved operational identifiers and omits undefined values', () => {
    const assign = vi.fn();
    const service = new LoggingContextService({ assign } as unknown as PinoLogger);

    service.assignContext({
      actorId: 'actor-1',
      endpoint: 'POST /v1/payments',
      paymentId: 'payment-1',
      qrCodeId: undefined,
      syncBatchId: 'sync-batch-1',
    });

    expect(assign).toHaveBeenCalledWith({
      actorId: 'actor-1',
      endpoint: 'POST /v1/payments',
      paymentId: 'payment-1',
      syncBatchId: 'sync-batch-1',
    });
  });

  it('does not assign an empty context', () => {
    const assign = vi.fn();
    const service = new LoggingContextService({ assign } as unknown as PinoLogger);

    service.assignContext({});

    expect(assign).not.toHaveBeenCalled();
  });
});

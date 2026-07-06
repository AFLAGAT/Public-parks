import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { MockPaymentProvider } from './mock-payment.provider';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.port';
import { PaymentsModule } from './payments.module';

describe('PaymentsModule', () => {
  it('binds PAYMENT_PROVIDER to the mock adapter for Phase 6', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PaymentsModule],
    }).compile();

    const provider = moduleRef.get<PaymentProvider>(PAYMENT_PROVIDER);
    expect(provider).toBeInstanceOf(MockPaymentProvider);
    expect(provider.providerKey).toBe('mock');

    // Same instance behind the token and the concrete class (useExisting).
    expect(moduleRef.get(MockPaymentProvider)).toBe(provider);

    await moduleRef.close();
  });
});

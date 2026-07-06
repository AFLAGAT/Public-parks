import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './mock-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider.port';

/**
 * The `PAYMENT_PROVIDER` token is bound to the mock adapter for all Phase 6
 * business logic and testing. Phase 7 introduces the real Telebirr adapter and
 * a config-driven selection at this single swap point; nothing upstream changes
 * because both implement {@link PaymentProvider}.
 */
@Module({
  providers: [
    MockPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: MockPaymentProvider },
  ],
  exports: [PAYMENT_PROVIDER, MockPaymentProvider],
})
export class PaymentsModule {}

import type {
  PaymentCallbackVerificationResult,
  PaymentInitiationRequest,
  PaymentInitiationResult,
} from './payment-provider.types';

/** DI token for the single active payment provider (mock now, Telebirr in Phase 7). */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/**
 * The payments domain's only dependency on an external payment provider. Every
 * payment-dependent capability (state machine, capacity consumption, QR
 * issuance) is built and tested against this interface, so a mock adapter today
 * and the real Telebirr adapter in Phase 7 are fully interchangeable.
 */
export interface PaymentProvider {
  /** Stable key persisted on `payment_attempts.provider_key` (e.g. `mock`, `telebirr`). */
  readonly providerKey: string;

  /**
   * Open a payment with the provider. Resolves to `initiated` (never
   * `confirmed` — confirmation is asynchronous via `verifyCallback`) or a
   * classified `failed`. Must not throw for an expected provider rejection;
   * surface it as a `failed` result so the caller can record the attempt.
   */
  initiatePayment(
    request: PaymentInitiationRequest,
  ): Promise<PaymentInitiationResult>;

  /**
   * Verify and normalize an inbound provider callback. Pure and deterministic:
   * the same payload always yields the same result regardless of arrival order
   * or repetition — deduplication and ordering are the caller's concern (the
   * `processed_provider_events` ledger), never this method's. Signature
   * verification lives here because only the provider knows its signing scheme.
   */
  verifyCallback(
    rawPayload: Record<string, unknown>,
  ): PaymentCallbackVerificationResult;
}

/**
 * Provider-boundary contract for the payments domain.
 *
 * These types are deliberately provider-agnostic: they carry only what the
 * payments domain needs to drive the payment state machine, capacity
 * consumption, and QR issuance — never Telebirr-specific request/response
 * shapes. The mock adapter implements them now; the real Telebirr adapter swaps
 * in behind the same contract in Phase 7 (DECISIONS.md — "Payment provider
 * integration timing"), changing nothing upstream.
 *
 * All money is integer santim (1 ETB = 100 santim), matching the platform money
 * representation decision (DECISIONS.md — entrance ticketing / payments schema).
 */

/** How a failed provider interaction should be treated by the caller. */
export type PaymentFailureClassification =
  | 'transient'
  | 'permanent'
  | 'configuration';

/**
 * Request to open a payment with the provider. `merchantReference` is our own
 * globally-unique order id (persisted as `payment_attempts.merchant_reference`);
 * the provider echoes it back on the async callback so we can tie a callback to
 * the originating attempt.
 */
export interface PaymentInitiationRequest {
  readonly merchantReference: string;
  readonly amount: number;
  readonly payerUserId: string;
  readonly description: string;
  readonly notifyUrl: string;
  readonly returnUrl: string;
}

/**
 * Result of opening a payment. Success is `initiated`, never `confirmed`:
 * confirmation is always asynchronous and arrives later via `verifyCallback`,
 * mirroring Telebirr's `notify_url` flow (DECISIONS.md — "C2B web checkout flow
 * shape"). `prepayId` maps to `payment_attempts.prepay_id`; `checkoutUrl` is the
 * provider-hosted page the resident opens. The provider transaction id is not
 * known at initiation — it arrives on the callback.
 */
export type PaymentInitiationResult =
  | {
      readonly outcome: 'initiated';
      readonly providerKey: string;
      readonly prepayId: string;
      readonly checkoutUrl: string;
    }
  | {
      readonly outcome: 'failed';
      readonly providerKey: string;
      readonly failureReason: string;
      readonly classification: PaymentFailureClassification;
    };

/**
 * Signature-verification outcome for an inbound provider callback. `duplicate`
 * is intentionally absent: exactly-once is enforced downstream by the
 * `processed_provider_events` ledger, not by the provider (DECISIONS.md —
 * "Payments, attempts, and webhook idempotency schema"). The provider only ever
 * reports whether the callback is authentic and interpretable.
 */
export type PaymentCallbackVerification =
  | 'verified'
  | 'signature_invalid'
  | 'unrecognized';

/** Whether the provider is reporting the payment as paid or not. */
export type PaymentCallbackOutcome = 'succeeded' | 'failed';

/**
 * Normalized, verified view of an inbound provider callback. On `verified` the
 * caller gets the actionable fields to drive payment state; the reported
 * `amount` is surfaced (never trusted blindly) so the caller can compare it to
 * the expected amount before confirming. `redactedPayload` is the raw callback
 * with provider-secret fields (e.g. signatures) stripped, safe to persist in the
 * append-only `webhook_events` log.
 */
export type PaymentCallbackVerificationResult =
  | {
      readonly verification: 'verified';
      readonly providerKey: string;
      readonly providerEventId: string;
      readonly merchantReference: string;
      readonly providerTransactionId: string;
      readonly paymentOutcome: PaymentCallbackOutcome;
      readonly amount: number;
      readonly redactedPayload: Record<string, unknown>;
    }
  | {
      readonly verification: 'signature_invalid' | 'unrecognized';
      readonly providerKey: string;
      readonly providerEventId: string | null;
      readonly redactedPayload: Record<string, unknown>;
    };

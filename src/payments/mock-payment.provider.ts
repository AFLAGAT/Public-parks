import { Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { PaymentProvider } from './payment-provider.port';
import type {
  PaymentCallbackOutcome,
  PaymentCallbackVerificationResult,
  PaymentFailureClassification,
  PaymentInitiationRequest,
  PaymentInitiationResult,
} from './payment-provider.types';

/**
 * Deterministic in-memory stand-in for a real payment provider, used for all
 * Phase 6 business-logic work and Phase 9 testing until the Telebirr adapter
 * lands (DECISIONS.md — "Payment provider integration timing"). It is a real
 * implementation of {@link PaymentProvider}, not a stub: initiation succeeds by
 * default and can be programmed to fail per order; callbacks are signed with an
 * HMAC so the `signature_invalid` path is genuinely exercisable.
 *
 * The three DECISIONS-mandated response modes map as follows:
 *  - success  → default `initiatePayment` result + a `verified`/`succeeded` callback.
 *  - failure  → `programInitiationFailure(...)`, or a `failed`-outcome callback.
 *  - delay    → confirmation is always asynchronous; the caller decides when to
 *               feed the callback to `verifyCallback`, so any delay (including
 *               out-of-order or duplicate delivery) is modeled without timers.
 */

/** The canonical shape of a mock provider callback (its simulated `notify_url` body). */
export interface MockCallbackPayload {
  readonly providerEventId: string;
  readonly merchantReference: string;
  readonly providerTransactionId: string;
  readonly outcome: PaymentCallbackOutcome;
  readonly amount: number;
  readonly mockSignature: string;
}

interface ProgrammedInitiationFailure {
  readonly failureReason: string;
  readonly classification: PaymentFailureClassification;
}

// Development/test-only shared secret; the real adapter verifies RSA-PSS instead.
const MOCK_SIGNING_SECRET = 'mock-payment-provider-signing-secret';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly providerKey = 'mock';

  private readonly initiationFailures = new Map<
    string,
    ProgrammedInitiationFailure
  >();

  initiatePayment(
    request: PaymentInitiationRequest,
  ): Promise<PaymentInitiationResult> {
    const programmedFailure = this.initiationFailures.get(
      request.merchantReference,
    );
    if (programmedFailure) {
      return Promise.resolve({
        outcome: 'failed',
        providerKey: this.providerKey,
        failureReason: programmedFailure.failureReason,
        classification: programmedFailure.classification,
      });
    }

    const prepayId = `mock_prepay_${randomUUID()}`;
    return Promise.resolve({
      outcome: 'initiated',
      providerKey: this.providerKey,
      prepayId,
      checkoutUrl: `https://mock-checkout.telebirr.local/pay/${prepayId}`,
    });
  }

  verifyCallback(
    rawPayload: Record<string, unknown>,
  ): PaymentCallbackVerificationResult {
    const parsed = this.parsePayload(rawPayload);
    if (!parsed) {
      return {
        verification: 'unrecognized',
        providerKey: this.providerKey,
        providerEventId: this.readString(rawPayload.providerEventId),
        redactedPayload: this.redact(rawPayload),
      };
    }

    const expectedSignature = this.computeSignature(parsed);
    if (!this.signaturesMatch(parsed.mockSignature, expectedSignature)) {
      return {
        verification: 'signature_invalid',
        providerKey: this.providerKey,
        providerEventId: parsed.providerEventId,
        redactedPayload: this.redact(rawPayload),
      };
    }

    return {
      verification: 'verified',
      providerKey: this.providerKey,
      providerEventId: parsed.providerEventId,
      merchantReference: parsed.merchantReference,
      providerTransactionId: parsed.providerTransactionId,
      paymentOutcome: parsed.outcome,
      amount: parsed.amount,
      redactedPayload: this.redact(rawPayload),
    };
  }

  // --- Test / sandbox affordances (not part of the PaymentProvider contract) ---

  /** Program the next `initiatePayment` for this order to fail. */
  programInitiationFailure(
    merchantReference: string,
    failureReason: string,
    classification: PaymentFailureClassification = 'transient',
  ): void {
    this.initiationFailures.set(merchantReference, {
      failureReason,
      classification,
    });
  }

  /**
   * Build a correctly-signed callback payload, simulating the provider calling
   * our `notify_url`. Tests and downstream Phase 6 work use this to produce a
   * `verified` callback; tampering with any returned field invalidates the
   * signature, exercising the `signature_invalid` path.
   */
  buildCallback(fields: {
    readonly merchantReference: string;
    readonly providerTransactionId: string;
    readonly outcome: PaymentCallbackOutcome;
    readonly amount: number;
    readonly providerEventId?: string;
  }): MockCallbackPayload {
    const core = {
      providerEventId: fields.providerEventId ?? `mock_evt_${randomUUID()}`,
      merchantReference: fields.merchantReference,
      providerTransactionId: fields.providerTransactionId,
      outcome: fields.outcome,
      amount: fields.amount,
    };
    return { ...core, mockSignature: this.computeSignature(core) };
  }

  /** Clear all programmed scenarios between tests. */
  reset(): void {
    this.initiationFailures.clear();
  }

  // --- internals ---

  private parsePayload(
    rawPayload: Record<string, unknown>,
  ): Omit<MockCallbackPayload, 'mockSignature'> & { mockSignature: string } | null {
    const providerEventId = this.readString(rawPayload.providerEventId);
    const merchantReference = this.readString(rawPayload.merchantReference);
    const providerTransactionId = this.readString(
      rawPayload.providerTransactionId,
    );
    const outcome = this.readOutcome(rawPayload.outcome);
    const amount = this.readAmount(rawPayload.amount);
    const mockSignature = this.readString(rawPayload.mockSignature);

    if (
      providerEventId === null ||
      merchantReference === null ||
      providerTransactionId === null ||
      outcome === null ||
      amount === null ||
      mockSignature === null
    ) {
      return null;
    }

    return {
      providerEventId,
      merchantReference,
      providerTransactionId,
      outcome,
      amount,
      mockSignature,
    };
  }

  private computeSignature(core: {
    readonly providerEventId: string;
    readonly merchantReference: string;
    readonly providerTransactionId: string;
    readonly outcome: PaymentCallbackOutcome;
    readonly amount: number;
  }): string {
    const canonical = [
      core.providerEventId,
      core.merchantReference,
      core.providerTransactionId,
      core.outcome,
      String(core.amount),
    ].join('|');
    return createHmac('sha256', MOCK_SIGNING_SECRET)
      .update(canonical)
      .digest('hex');
  }

  private signaturesMatch(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(providedBuffer, expectedBuffer);
  }

  private redact(
    rawPayload: Record<string, unknown>,
  ): Record<string, unknown> {
    const redacted = { ...rawPayload };
    delete redacted.mockSignature;
    return redacted;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private readOutcome(value: unknown): PaymentCallbackOutcome | null {
    return value === 'succeeded' || value === 'failed' ? value : null;
  }

  private readAmount(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? value
      : null;
  }
}

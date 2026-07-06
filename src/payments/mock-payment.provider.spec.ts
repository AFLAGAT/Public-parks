import { beforeEach, describe, expect, it } from 'vitest';
import { MockPaymentProvider } from './mock-payment.provider';
import type { PaymentInitiationRequest } from './payment-provider.types';

const baseInitiation: PaymentInitiationRequest = {
  merchantReference: 'order_0001',
  amount: 15_000, // 150.00 ETB in santim
  payerUserId: '11111111-1111-1111-1111-111111111111',
  description: 'Entrance ticket — Ghion Pool',
  notifyUrl: 'https://api.example.gov.et/v1/payments/callbacks/mock',
  returnUrl: 'https://app.example.gov.et/payments/order_0001/return',
};

describe('MockPaymentProvider', () => {
  let provider: MockPaymentProvider;

  beforeEach(() => {
    provider = new MockPaymentProvider();
  });

  describe('initiatePayment', () => {
    it('opens a payment as initiated with a prepay id and checkout url (never confirmed)', async () => {
      const result = await provider.initiatePayment(baseInitiation);

      expect(result.outcome).toBe('initiated');
      if (result.outcome !== 'initiated') return;
      expect(result.providerKey).toBe('mock');
      expect(result.prepayId).toMatch(/^mock_prepay_/);
      expect(result.checkoutUrl).toContain(result.prepayId);
    });

    // Failure mode: an expected provider rejection is surfaced, not thrown, so
    // the caller can record the attempt and drive the state machine.
    it('returns a classified failed result when programmed to fail — without throwing', async () => {
      provider.programInitiationFailure(
        baseInitiation.merchantReference,
        'insufficient_balance',
        'permanent',
      );

      const result = await provider.initiatePayment(baseInitiation);

      expect(result.outcome).toBe('failed');
      if (result.outcome !== 'failed') return;
      expect(result.failureReason).toBe('insufficient_balance');
      expect(result.classification).toBe('permanent');
    });

    it('only fails the programmed order, leaving other orders initiated', async () => {
      provider.programInitiationFailure(baseInitiation.merchantReference, 'x');

      const other = await provider.initiatePayment({
        ...baseInitiation,
        merchantReference: 'order_0002',
      });

      expect(other.outcome).toBe('initiated');
    });
  });

  describe('verifyCallback', () => {
    it('verifies an authentic success callback and surfaces the reported amount', () => {
      const payload = provider.buildCallback({
        merchantReference: 'order_0001',
        providerTransactionId: 'mock_txn_777',
        outcome: 'succeeded',
        amount: 15_000,
      });

      const result = provider.verifyCallback({ ...payload });

      expect(result.verification).toBe('verified');
      if (result.verification !== 'verified') return;
      expect(result.merchantReference).toBe('order_0001');
      expect(result.providerTransactionId).toBe('mock_txn_777');
      expect(result.paymentOutcome).toBe('succeeded');
      expect(result.amount).toBe(15_000);
      expect(result.providerEventId).toBe(payload.providerEventId);
    });

    it('reports a provider-declared payment failure as verified but failed', () => {
      const payload = provider.buildCallback({
        merchantReference: 'order_0001',
        providerTransactionId: 'mock_txn_778',
        outcome: 'failed',
        amount: 15_000,
      });

      const result = provider.verifyCallback({ ...payload });

      expect(result.verification).toBe('verified');
      if (result.verification !== 'verified') return;
      expect(result.paymentOutcome).toBe('failed');
    });

    // Failure mode: money tampering. Changing the amount after signing must
    // break verification, never yield a confirmable result.
    it('rejects a callback whose amount was tampered after signing', () => {
      const payload = provider.buildCallback({
        merchantReference: 'order_0001',
        providerTransactionId: 'mock_txn_779',
        outcome: 'succeeded',
        amount: 15_000,
      });

      const result = provider.verifyCallback({ ...payload, amount: 1 });

      expect(result.verification).toBe('signature_invalid');
    });

    // Failure mode: forged signature.
    it('rejects a callback carrying a forged signature', () => {
      const payload = provider.buildCallback({
        merchantReference: 'order_0001',
        providerTransactionId: 'mock_txn_780',
        outcome: 'succeeded',
        amount: 15_000,
      });

      const result = provider.verifyCallback({
        ...payload,
        mockSignature: 'deadbeef',
      });

      expect(result.verification).toBe('signature_invalid');
      if (result.verification !== 'signature_invalid') return;
      expect(result.providerEventId).toBe(payload.providerEventId);
    });

    // Failure mode: malformed / unrecognized payload.
    it('marks a payload missing required fields as unrecognized', () => {
      const result = provider.verifyCallback({
        merchantReference: 'order_0001',
      });

      expect(result.verification).toBe('unrecognized');
    });

    it('rejects a non-integer amount as unrecognized', () => {
      const payload = provider.buildCallback({
        merchantReference: 'order_0001',
        providerTransactionId: 'mock_txn_781',
        outcome: 'succeeded',
        amount: 15_000,
      });

      const result = provider.verifyCallback({ ...payload, amount: 150.5 });

      // amount is not an integer → payload is unparseable before signature check
      expect(result.verification).toBe('unrecognized');
    });

    // Failure mode: duplicate / out-of-order delivery. The provider is pure, so
    // repeated verification of the same callback yields identical results — it
    // never double-confirms. Deduplication is the ledger's job, not this method's.
    it('is deterministic across repeated (duplicate/out-of-order) deliveries', () => {
      const payload = provider.buildCallback({
        merchantReference: 'order_0001',
        providerTransactionId: 'mock_txn_782',
        outcome: 'succeeded',
        amount: 15_000,
      });

      const first = provider.verifyCallback({ ...payload });
      const second = provider.verifyCallback({ ...payload });

      expect(second).toEqual(first);
    });

    it('never includes the signature in the redacted payload it returns', () => {
      const payload = provider.buildCallback({
        merchantReference: 'order_0001',
        providerTransactionId: 'mock_txn_783',
        outcome: 'succeeded',
        amount: 15_000,
      });

      const verified = provider.verifyCallback({ ...payload });
      const invalid = provider.verifyCallback({
        ...payload,
        mockSignature: 'forged',
      });

      expect(verified.redactedPayload).not.toHaveProperty('mockSignature');
      expect(invalid.redactedPayload).not.toHaveProperty('mockSignature');
      expect(verified.redactedPayload.merchantReference).toBe('order_0001');
    });
  });

  describe('reset', () => {
    it('clears programmed initiation failures', async () => {
      provider.programInitiationFailure(baseInitiation.merchantReference, 'x');
      provider.reset();

      const result = await provider.initiatePayment(baseInitiation);

      expect(result.outcome).toBe('initiated');
    });
  });
});

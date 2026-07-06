import { describe, expect, it } from 'vitest';
import { entranceTicketStatus } from '../database/drizzle.schema';
import {
  EntranceTicketStatePolicy,
  IllegalEntranceTicketTransitionError,
  type EntranceTicketStatus,
} from './entrance-ticket-state.policy';

const ALL_STATUSES = entranceTicketStatus.enumValues as readonly EntranceTicketStatus[];

describe('EntranceTicketStatePolicy', () => {
  const policy = new EntranceTicketStatePolicy();

  it('starts every ticket in pending_payment', () => {
    expect(policy.initialStatus()).toBe('pending_payment');
  });

  it('covers every status in the DB enum (no drift)', () => {
    // Guards against a future enum value being added without a transition rule.
    for (const status of ALL_STATUSES) {
      expect(() => policy.allowedTransitions(status)).not.toThrow();
    }
    expect(ALL_STATUSES).toHaveLength(8);
  });

  describe('legal transitions', () => {
    const legalCases: ReadonlyArray<
      [EntranceTicketStatus, EntranceTicketStatus]
    > = [
      ['pending_payment', 'confirmed'],
      ['pending_payment', 'expired'],
      ['pending_payment', 'canceled'],
      ['confirmed', 'partially_used'],
      ['confirmed', 'fully_used'],
      ['confirmed', 'canceled'],
      ['confirmed', 'refunded'],
      ['confirmed', 'disputed'],
      ['partially_used', 'fully_used'],
      ['partially_used', 'refunded'],
      ['partially_used', 'disputed'],
      ['fully_used', 'disputed'],
    ];

    it.each(legalCases)('permits %s -> %s', (from, to) => {
      expect(policy.classifyTransition(from, to)).toBe('legal');
      expect(policy.canTransition(from, to)).toBe(true);
      expect(policy.assertTransition(from, to)).toBe('legal');
    });
  });

  describe('illegal transitions (failure mode)', () => {
    const illegalCases: ReadonlyArray<
      [EntranceTicketStatus, EntranceTicketStatus]
    > = [
      // Cannot skip payment confirmation.
      ['pending_payment', 'partially_used'],
      ['pending_payment', 'fully_used'],
      ['pending_payment', 'refunded'],
      // Cannot resurrect a terminal status.
      ['expired', 'confirmed'],
      ['canceled', 'confirmed'],
      ['refunded', 'confirmed'],
      ['disputed', 'confirmed'],
      // A fully-consumed ticket is not directly refundable (money edge).
      ['fully_used', 'refunded'],
      ['fully_used', 'canceled'],
      // Cannot un-use a ticket.
      ['fully_used', 'partially_used'],
      ['partially_used', 'confirmed'],
      // Cannot cancel after use.
      ['partially_used', 'canceled'],
    ];

    it.each(illegalCases)('rejects %s -> %s', (from, to) => {
      expect(policy.classifyTransition(from, to)).toBe('illegal');
      expect(policy.canTransition(from, to)).toBe(false);
      expect(() => policy.assertTransition(from, to)).toThrow(
        IllegalEntranceTicketTransitionError,
      );
    });

    it('names the from/to on the thrown error for auditability', () => {
      try {
        policy.assertTransition('fully_used', 'refunded');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(IllegalEntranceTicketTransitionError);
        const typed = error as IllegalEntranceTicketTransitionError;
        expect(typed.from).toBe('fully_used');
        expect(typed.to).toBe('refunded');
      }
    });
  });

  describe('idempotency (duplicate / out-of-order events)', () => {
    // A re-applied transition that lands on the current status is a safe no-op,
    // never illegal — a duplicate payment-verified webhook must not double-confirm
    // or error.
    it.each(ALL_STATUSES)('treats %s -> %s (self) as a noop', (status) => {
      expect(policy.classifyTransition(status, status)).toBe('noop');
      expect(policy.canTransition(status, status)).toBe(true);
      expect(policy.assertTransition(status, status)).toBe('noop');
    });
  });

  describe('terminal statuses', () => {
    const terminal: readonly EntranceTicketStatus[] = [
      'canceled',
      'expired',
      'refunded',
      'disputed',
    ];
    const nonTerminal: readonly EntranceTicketStatus[] = [
      'pending_payment',
      'confirmed',
      'partially_used',
      'fully_used',
    ];

    it.each(terminal)('%s is terminal with no legal outgoing transition', (status) => {
      expect(policy.isTerminal(status)).toBe(true);
      expect(policy.allowedTransitions(status)).toHaveLength(0);
      for (const to of ALL_STATUSES) {
        if (to === status) continue;
        expect(policy.classifyTransition(status, to)).toBe('illegal');
      }
    });

    it.each(nonTerminal)('%s is not terminal', (status) => {
      expect(policy.isTerminal(status)).toBe(false);
      expect(policy.allowedTransitions(status).length).toBeGreaterThan(0);
    });
  });
});

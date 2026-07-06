import { Injectable } from '@nestjs/common';
import { entranceTicketStatus } from '../database/drizzle.schema';

/**
 * The entrance ticket lifecycle, defined over the owner-confirmed
 * `entrance_ticket_status` DB enum (DECISIONS.md — "Entrance ticketing and
 * capacity schema" / "Entrance ticket state machine"). The status union is
 * derived from `entranceTicketStatus.enumValues` so the state machine can never
 * drift from the database enum — the enum is the single source of truth.
 */
export type EntranceTicketStatus = (typeof entranceTicketStatus.enumValues)[number];

/**
 * How a requested status change is classified:
 *  - `legal`   — a permitted forward transition.
 *  - `noop`    — the ticket is already in the target status (idempotent replay,
 *                e.g. a duplicate payment-verified webhook re-confirming a
 *                confirmed ticket); safe to skip without side effects.
 *  - `illegal` — not a permitted transition; must be rejected.
 */
export type TicketTransitionClassification = 'legal' | 'noop' | 'illegal';

/** The single initial status every entrance ticket is created in. */
const INITIAL_STATUS: EntranceTicketStatus = 'pending_payment';

/**
 * Adjacency map of permitted forward transitions (self-transitions are handled
 * separately as idempotent no-ops, so they are intentionally absent here).
 * Every enum value has an entry; terminal statuses map to an empty set.
 *
 * Money-sensitive edges (adopted conservative default, revisable when the
 * refund/dispute flows are built): direct `refunded` is reachable from
 * `confirmed` and `partially_used` but NOT `fully_used` — a fully-consumed
 * ticket's grievance goes through `disputed`; `disputed` is reachable from any
 * paid/used status; `refunded` and `disputed` are terminal (dispute-resolution
 * transitions are deferred to the dispute-handling item).
 */
const ALLOWED_TRANSITIONS: Readonly<
  Record<EntranceTicketStatus, readonly EntranceTicketStatus[]>
> = {
  pending_payment: ['confirmed', 'expired', 'canceled'],
  confirmed: ['partially_used', 'fully_used', 'canceled', 'refunded', 'disputed'],
  partially_used: ['fully_used', 'refunded', 'disputed'],
  fully_used: ['disputed'],
  canceled: [],
  expired: [],
  refunded: [],
  disputed: [],
};

/** Thrown when an illegal entrance ticket status transition is attempted. */
export class IllegalEntranceTicketTransitionError extends Error {
  constructor(
    readonly from: EntranceTicketStatus,
    readonly to: EntranceTicketStatus,
  ) {
    super(
      `Illegal entrance ticket transition: ${from} -> ${to}. Allowed: ${
        ALLOWED_TRANSITIONS[from].join(', ') || '(none — terminal)'
      }.`,
    );
    this.name = 'IllegalEntranceTicketTransitionError';
  }
}

/**
 * Pure, side-effect-free guard for entrance ticket status transitions. It does
 * not touch the database or move money — it only answers whether a status
 * change is permitted, so the entrance-ticket service, payment confirmation,
 * and staff check-in can enforce the lifecycle consistently before writing.
 * Idempotency is first-class: re-applying a transition that lands on the current
 * status is classified `noop`, never `illegal`, so duplicated/out-of-order
 * events cannot corrupt state.
 */
@Injectable()
export class EntranceTicketStatePolicy {
  /** The status a newly created entrance ticket starts in. */
  initialStatus(): EntranceTicketStatus {
    return INITIAL_STATUS;
  }

  /** A status with no permitted outgoing transition. */
  isTerminal(status: EntranceTicketStatus): boolean {
    return ALLOWED_TRANSITIONS[status].length === 0;
  }

  /** The permitted forward target statuses from `from` (excludes the self no-op). */
  allowedTransitions(
    from: EntranceTicketStatus,
  ): readonly EntranceTicketStatus[] {
    return ALLOWED_TRANSITIONS[from];
  }

  /** Classify a requested transition without throwing. */
  classifyTransition(
    from: EntranceTicketStatus,
    to: EntranceTicketStatus,
  ): TicketTransitionClassification {
    if (from === to) {
      return 'noop';
    }
    return ALLOWED_TRANSITIONS[from].includes(to) ? 'legal' : 'illegal';
  }

  /** True for a permitted transition or an idempotent no-op. */
  canTransition(
    from: EntranceTicketStatus,
    to: EntranceTicketStatus,
  ): boolean {
    return this.classifyTransition(from, to) !== 'illegal';
  }

  /**
   * Assert a transition is permitted, throwing
   * {@link IllegalEntranceTicketTransitionError} if not. Returns the
   * classification so a caller can distinguish a `noop` replay from a `legal`
   * advance and skip side effects accordingly.
   */
  assertTransition(
    from: EntranceTicketStatus,
    to: EntranceTicketStatus,
  ): TicketTransitionClassification {
    const classification = this.classifyTransition(from, to);
    if (classification === 'illegal') {
      throw new IllegalEntranceTicketTransitionError(from, to);
    }
    return classification;
  }
}

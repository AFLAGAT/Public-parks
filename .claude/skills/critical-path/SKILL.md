---
name: critical-path
description: Use whenever work touches payments/Telebirr, QR issuance or validation, entrance capacity locking, auth/RBAC/OTP/MFA/tokens, or audit-log immutability on this codebase — enforces AIRules.md's Critical-Path Rules, stop-and-ask triggers, and failure-mode Testing Gate where a quiet bug becomes a financial loss or public incident.
---

# Critical-Path Rules

These five areas are where a quiet bug becomes a public incident or financial loss. **Structure beats speed here, no exceptions.** Identified by the Priority Rubric in `AIRules.md`, NOT by every item that happens to carry a "Critical" label. AIRules.md is the authority; this is the enforcement checklist.

The five critical paths: **payments · QR validation · capacity locking · auth · audit immutability.**

## Hard rules

- No shortcuts, no `TODO: handle later`, no untested error paths, no stubs, no "good enough for now."
- **Payments:** every state transition idempotent — assume Telebirr webhooks arrive late, duplicated, or out of order. Exactly-once via the `processed_provider_events` ledger reserved transactionally before acting. Money is integer santim (bigint). Core payment fields (`amount`, `payable_type`, `payable_id`, `payer_user_id`) are write-once at the DB layer.
- **Capacity:** purchases use the atomic conditional decrement (`... SET sold_count = sold_count + :qty WHERE ... AND sold_count + :qty <= max_capacity RETURNING id`; no row = sold out). Never a read-then-write race.
- **QR:** validate single-use / status **server-side**, never trust the client; signed token carries only the QR record id; revocable; scoped to booking type.
- **Auth:** authenticated-by-default with an explicit public allowlist; server-side permission + facility-scope checks; hidden UI is not a control.
- **Audit:** writes go through the INSERT-only path; no code path may grant UPDATE/DELETE on audit tables; append-only, partitioned.

## Stop-and-ask (do NOT decide alone)

Stop and ask the project owner before proceeding if:

- The work requires a **schema change** to `payments`, `entrance_tickets`, `facility_capacities`, slot reservation tables, or `audit_logs` (and related critical tables). Owner confirmation is required before applying.
- The requirement is ambiguous and two reasonable implementations would behave differently for **money, access control, or data retention**.
- You are about to mark a critical-path item complete **without its failure-mode test**.
- A request conflicts with `AIRules.md`.
- A needed decision is security/payment/capacity/legal AND has no clear industry-standard default.

## Failure-mode Testing Gate (required — happy path is not enough)

A critical-path item is NOT done without a test that exercises the failure mode. Pick the ones that apply:

- Duplicate / out-of-order / replayed Telebirr webhook → no double-confirm, double-refund, or corrupted state.
- Concurrent purchase of the **last** unit → exactly one winner, `sold_count` ends correct, no oversell.
- Expired / forged / replayed / revoked QR → rejected server-side.
- Cross-facility or revoked-assignment staff access → denied.
- Attempted UPDATE/DELETE on an audit row or mutation of a write-once payment field → rejected by the DB.

Prefer real-Postgres integration tests (`npm run test:integration`) for DB-enforced invariants — the constraint/trigger/index IS the thing under test.

## Red flags

- "I'll add the failure-mode test after" → then it isn't done. Write it as part of the work.
- "I'll just tweak the payments/audit/capacity table quickly" → schema change → stop and ask the owner first.
- "The client already checked single-use" → re-check server-side; the client is hostile input.
- "Reasonable default, I'll just pick it" on money/access/retention ambiguity → escalate instead.

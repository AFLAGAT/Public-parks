---
name: checklist-item
description: Use when starting, building, or closing any BACKEND_BUILD_CHECKLIST.md item on this codebase — runs the Pre-Work Validation, Testing Gate, and Definition of Done from AIRules.md so an item is only marked complete when it genuinely is.
---

# Checklist Item Lifecycle

Operationalizes `AIRules.md` (Pre-Work Validation, Testing Gate, Definition of Done, Branch/Merge, Learning-Guide Enforcement). AIRules.md is the authority; this is the checklist. Match effort to the item's risk — proportionality beats perfectionism everywhere except the critical paths.

## Phase A — Pre-work validation (before writing code)

Answer all five. If any is "no" or "uncertain", STOP and resolve it first.

1. Does the plan follow `NamingConventions.md`?
2. Is this the correct next item under the **Execution Model** (a real foundation prerequisite, or the next step in the active slice)?
3. If it's a **"define/design/decide"** item: is it already in `DECISIONS.md`? If yes, it's settled — mark done, move on. If no, propose ONE concrete industry-standard answer, log it in `DECISIONS.md` with a one-line reason in the same pass, mark done. Do NOT turn it into open-ended research. (Exception: security/payment/capacity/legal with no clear default → escalate to owner.)
4. Does this item touch a **critical path** (payments, QR, capacity locking, auth, audit immutability)? If yes → **invoke the `critical-path` skill now** and apply its rules + the failure-mode Testing Gate.
5. Which **Testing Gate tier** and **learning-guide tier** apply?

## Phase B — Build

- Work in reviewable, additive increments — no large unrequested rewrites, no overwriting working code unless the task requires it (and say so first).
- Keep code inside the module boundaries in `DECISIONS.md` (`auth`, `facilities`, `slot-booking`, `entrance-ticketing`, `payments`, `qr`, `notifications`, `admin-analytics`, `sync`, `audit-logs`).
- Do not introduce a new dependency/library/service without flagging it first and stating why.
- Branch per item: `claude/phase-NN-<item-slug>` off `main`.

## Phase C — Testing Gate (required to mark done)

Item runs without errors against the current schema AND meets its tier:

- **Critical-path items** → a test exercising the **failure mode** is REQUIRED (duplicate webhook, concurrent last-ticket purchase, expired/forged/replayed QR, revoked/cross-facility access, out-of-order payment event). Happy-path only is a rules violation.
- **Other Critical + High items** → at least one success-path test AND one main rejection/error-path test.
- **Medium / pure wiring** → a test where behavior is non-trivial; smoke/compile test acceptable for glue with no logic.

Run the real suites: `npm run test:unit`, `npm run test:integration` (or `test:all`), plus `npm run typecheck` and `npm run lint`. **Do not claim green without the actual output** — see the `verification-before-completion` superpower.

## Phase D — Definition of Done (all four, then CLOSE)

1. It works against the current schema.
2. It meets its Testing Gate tier (Phase C).
3. Its `learning-guide/phase-NN.md` entry is written at its tier — critical-path = full (what/why/how/concepts/pitfalls); everything else = concise 3–6 sentences. Also add the one-line index entry in `learning-guide/README.md`.
4. `BACKEND_BUILD_CHECKLIST.md` is updated: mark the box, note any deviation and which slice the item belonged to.

Then merge to `main` on green (no PR step in this solo build unless the owner asks). **Once closed, do not re-open to polish.** A later-found critical-path bug → fix now with a test. Anything else → file a new scoped item under the owning phase (perf→8, security/load→9, ops→10, gate→11) and keep moving.

## Red flags

| Thought | Reality |
|---|---|
| "I'll write the learning-guide entry later / in a batch" | Not deferrable. Write it before the next item starts. |
| "Happy path passes, good enough" (critical path) | Failure-mode test is mandatory. Not done without it. |
| "Let me polish this closed foundational file" | Anti-rework rule: file a new scoped item instead. |
| "Tests probably pass" | Run them. Evidence before claiming done. |
| "This define item needs more research" | Pick the standard default, log it, move on. |

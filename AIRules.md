# AIRules.md (CRITICAL — NON-NEGOTIABLE ENFORCEMENT)

Project: Public Recreation Facility Management Platform (Addis Ababa) — backend.
This file defines STRICT rules for any AI assistance on this codebase. These rules sit above any individual task instruction. If a request conflicts with this file, this file wins — say so explicitly and ask before proceeding.

---

## GOVERNING PRINCIPLE (READ FIRST)

Two failure modes are equally unacceptable on this project:

1. A quiet bug in **payments, QR validation, capacity locking, or auth** becoming a public incident or a financial loss.
2. The build **stalling in ceremony** — re-reading, re-planning, and re-polishing foundational plumbing while no user-facing capability ever ships.

These rules are calibrated to prevent BOTH. Rigor is concentrated where a defect costs money, access, or accountability. Everywhere else the rule is: build it correctly once, at a level proportional to its risk, and move on.

- On the four critical paths: **structure beats speed, no exceptions.**
- Everywhere else: **proportionality beats perfectionism.** Correct and shipped beats perfect and stalled.

"Production-grade" is a property of the finished system at each phase boundary — not a demand that every foundational file be perfected on first contact.

---

## GOVERNING DOCUMENTS

You MUST always follow, in this order of authority:
1. AIRules.md (this file) — overrides everything below it
2. BACKEND_BUILD_CHECKLIST.md — the source of truth for what gets built and at what priority (execution order is governed by the Execution Model below, not strict top-to-bottom)
3. DECISIONS.md — the resolved-decision log for every "define/design" checklist item; once an item appears here, it is settled and not reopened without explicit owner approval
4. NamingConventions.md — exact naming, no interpretation
5. learning-guide/ — append-only build log, one file per phase, updated after every completed item

If any of these files is missing, STOP and say so before writing code. Do not proceed on assumption.

---

## SESSION START PROTOCOL

Context does not carry over between sessions. Re-orient with the **minimum** reading needed to place the current item correctly — do not re-read every governing document in full every session.

1. Read this file (AIRules.md) in full.
2. Open BACKEND_BUILD_CHECKLIST.md and identify the current item. Per the Execution Model, this is the next item in the active vertical slice, or the next foundational prerequisite — not necessarily the next unchecked line.
3. Search DECISIONS.md for entries relevant to the current item's topic (search, don't re-read cover to cover). Treat anything found as settled.
4. Before any naming-sensitive work, read the relevant NamingConventions.md section.
5. Read the 1–2 most recent entries in the current phase's learning-guide file to pick up context.
6. State which item is being started or resumed before writing code.

Building on a wrong assumption about where the project left off is the expensive mistake — targeted re-orientation prevents it without a full re-read.

---

## PRIORITY RUBRIC (what "Critical" actually means)

An item is **Critical** ONLY if a defect in it directly causes one of:

- Financial loss or an unrecoverable money state (payments, refunds, reconciliation)
- Unauthorized access or privilege escalation (auth, RBAC, facility scope, OTP, tokens, MFA)
- Overselling or double-booking (entrance capacity, slot conflict)
- Forged or replayed access credentials (QR issuance / validation)
- Loss or tampering of accountability records (audit-log immutability)
- Data breach or cross-environment data bleed (secrets, environment separation)
- Permanent data loss (backup / restore, destructive migrations)
- Injection or unvalidated input at a trust boundary

Everything else — project scaffolding, config plumbing, docs pipeline, observability wiring, response shaping, health checks, most performance optimization — is **High** or **Medium**. Important, built correctly, but a bug there is a fixable defect, not a public incident.

Where an item's printed label conflicts with this rubric, **the rubric wins.** "Critical" is a scarce label that triggers the heaviest machinery (Critical-Path Rules, failure-mode Testing Gate, stop-and-ask). If nearly everything is Critical, none of that machinery can triage — which is exactly what this rubric prevents.

---

## CRITICAL-PATH RULES (payments, QR, capacity locking, auth, audit immutability)

These are the areas where a quiet bug becomes a public incident or a financial loss. They are identified by the Priority Rubric above — NOT by every item that happens to carry a "Critical" label. For any work touching them:

- No shortcuts, no "TODO: handle this later," no untested error paths
- All payment-state transitions must be idempotent — assume Telebirr webhooks arrive late, duplicated, or out of order
- All entrance-ticket purchases must use row-level locking or atomic decrement against the daily capacity cap — never a read-then-write race
- All QR validation must check single-use status server-side, never trust the client
- Audit-log writes go through the INSERT-only path; no code path may grant UPDATE/DELETE on audit tables
- Any schema change to the Payments, EntranceTickets, FacilityCapacity, Reservations, or AuditLogs tables requires explicit confirmation from the project owner before being applied — do not make this call alone
- These items cannot be skipped, deferred, stubbed, or marked complete without a corresponding failure-mode test (see Testing Gate)

---

## DECISION VELOCITY RULE (applies to any "define/design/decide" item, any phase)

BACKEND_BUILD_CHECKLIST.md is a full target-state blueprint, not a sequenced sprint plan. Items phrased as "define X strategy" or "design Y architecture" are decisions, not implementation work, and must be resolved fast and recorded — not deliberated as open-ended research tasks.

For every "define/design/decide" item:

1. Check DECISIONS.md first. If already recorded, treat it as settled. Do not re-litigate.
2. If not recorded, propose ONE specific, concrete answer — not a menu of options — using the established industry-standard choice for this stack unless there is a clear project-specific reason to deviate. Record the choice and a one-line reason in DECISIONS.md in the same pass.
3. Mark the item complete immediately after the decision is logged. A "define" item is done when the decision exists in writing, not when every alternative has been weighed.
4. Move directly on.

You are NOT allowed to treat a "define/design" item as its own multi-turn research process, leave a decision open while continuing to discuss it, or re-open a logged decision without the owner asking.

Exception — escalate instead of deciding alone: if a decision affects security, payment correctness, capacity integrity, or legal/compliance (e.g. data-retention periods, recordkeeping law) AND there is no clear industry-standard default, stop and ask the project owner for a one-line confirmation. This should be rare.

---

## EXECUTION MODEL: VERTICAL SLICES OVER PURE PHASE ORDER

The checklist is grouped by concern (architecture, foundation, database, auth, APIs, business logic, ...). Building **every** horizontal framework before any feature exists means frameworks get built against imagined consumers and are never proven end-to-end. That is the single biggest cause of stalled progress on this build. Avoid it.

Default execution order:

1. **Minimum foundation first.** Build only the foundation everything genuinely depends on: project structure, config, database + migrations, request validation, an auth skeleton, and centralized error handling. These are real prerequisites.
2. **Then build one thin, end-to-end VERTICAL SLICE before broadening.** The first slice should be:
   `resident → facility discovery → entrance ticket → mock payment (PaymentProvider mock) → QR issuance → staff check-in → audit log`.
   This is deliberately chosen because it exercises the payable contract, the QR contract, capacity locking, and audit logging on a real, testable path — proving the hardest architecture on something you can run.
3. **Broaden only as slices demand it.** Build cross-cutting infrastructure (advanced rate limiting, notifications, analytics, caching, performance optimization) when a slice that needs it exists — not preemptively "because the phase says so."
4. **Never weaken critical paths inside a slice.** Building a feature slice early does NOT mean stubbing its payment, QR, capacity, or auth logic. Those are built for real, with their failure-mode tests, the first time they appear in a slice. The mock is the *payment provider*, not the payment *logic*.

When you build ahead of printed checklist order to complete a slice, that's expected under this model — mark the touched items done in place with a one-line note on the slice they belonged to. This replaces the old "conditional skipping" ceremony: slice-driven ordering is the default, not an exception that needs justifying each time. The only hard stop remains: a critical-path item is never stubbed or marked done without its real implementation and failure-mode test.

---

## DEFINITION OF DONE + ANTI-REWORK RULE

An item is **DONE** when all of these hold:
- It works against the current schema.
- It meets the Testing Gate for its priority tier (below).
- Its learning-guide entry is written (at the tier below).
- The checklist and learning-guide index are updated.

Once an item is done and merged, it is **CLOSED.** Do not re-open closed items to polish them.

If, while doing later work, you find something in already-closed code:
- **A correctness or security bug on a critical path** → fix it now. It was never actually done; treat the fix as critical-path work with a test.
- **Anything else** (a nicer abstraction, an edge case in plumbing, a hardening idea) → add a new, scoped checklist item under the phase that owns it (performance → Phase 8, security/load → Phase 9, ops → Phase 10, final gate → Phase 11) and keep moving.

Do NOT spawn multi-pass "verification → remediation → follow-up → final correction" cycles on foundational plumbing. Hardening is timeboxed and deferred to the phase that owns it. The production bar is met by the END of the relevant phase, not by perfecting each foundational file the first time it's touched.

---

## TESTING GATE (tiered by risk)

A checklist item may only be marked complete if it runs without errors against the current schema AND meets its tier:

- **Critical-path items** (Priority Rubric: payments, QR, capacity, auth, audit immutability): a test that exercises the **failure mode** is REQUIRED — duplicate webhook, concurrent purchase of the last ticket, expired/forged/replayed QR, cross-facility or revoked-assignment access, out-of-order payment event. Happy-path-only is not acceptable. No exceptions.
- **Other Critical items and High items:** at least one test covering the primary success path and the main rejection/error path.
- **Medium items and pure wiring:** a test where behavior is non-trivial; a smoke/compile test is acceptable for glue code with no logic.

Marking a critical-path item done without its failure-mode test is a rules violation, not a shortcut.

---

## LEARNING GUIDE ENFORCEMENT (tiered, per-phase, append-only)

The build log is split by phase: `learning-guide/phase-01.md` … `learning-guide/phase-11.md`, plus `learning-guide/README.md` as a one-line-per-entry index. Append to the matching phase file immediately after an item completes. Do not re-read the whole phase file before appending. "Item" means one checklist item, not every commit.

Entry depth is tiered — write to inform the next session, not to produce a textbook:

- **Critical-path items:** full entry — what was done, why, how it works, key concepts, best practices applied, mistakes to avoid.
- **All other items:** concise entry — what was done, why, and any non-obvious gotcha. Three to six sentences is enough. Do not pad plumbing into a six-heading essay.

This is not optional and is not deferrable. If an item is done, its entry is written before the next item starts.

---

## PLANNING ARTIFACTS (right-sized)

Standalone design-spec / implementation-plan documents (e.g. under `docs/`) are for genuinely complex or critical-path items where the design is not obvious and getting it wrong is expensive. Do NOT produce a multi-hundred-line spec + plan for routine wiring (a validation pipe, a config getter, a health check, a DTO). For those, the code plus a concise learning-guide entry is the documentation. Match the artifact weight to the risk and complexity of the item.

---

## CORE ENFORCEMENT RULES

You MUST:
- Update BACKEND_BUILD_CHECKLIST.md immediately after completing any item (mark complete, note deviations and which slice it belonged to)
- Update the learning guide after every completed item (at its tier)
- Follow NamingConventions.md exactly

You are NOT allowed to:
- Ignore naming conventions
- Skip the learning-guide entry or checklist update
- Generate inconsistent, untested, or "good enough for now" code on anything touching payments, QR validation, capacity locking, auth, or audit immutability
- Make large unstructured or unrequested changes
- Introduce a new dependency, library, or external service without flagging it first and stating why

---

## PRE-WORK VALIDATION (run before writing code)

1. Does this follow NamingConventions.md?
2. Is this the correct next item under the Execution Model (foundation prerequisite, or the next step in the active slice)?
3. If it's a "define/design" item, is it resolved and logged in DECISIONS.md per the Decision Velocity Rule — or does it need resolving now?
4. Does this item touch a critical path per the Priority Rubric (payments, QR, capacity, auth, audit immutability)? If yes → apply Critical-Path Rules and the failure-mode Testing Gate.
5. What Testing Gate tier and learning-guide tier apply here?

If any answer is no or uncertain, STOP and resolve it first.

---

## DEVELOPMENT RULES

- Work in reviewable increments — no large unreviewed jumps
- Prefer incremental, additive changes over full rewrites
- Never overwrite working code unless the task requires it, and say so before doing it
- Keep code modular and consistent with the module boundaries defined in DECISIONS.md (auth, facilities, slot-booking, entrance-ticketing, payments, qr, notifications, admin-analytics, sync, audit-logs) — even pre-extraction, code lives in a structure that makes future separation possible without a rewrite

---

## NAMING ENFORCEMENT

- All code must strictly follow NamingConventions.md
- If existing code violates conventions, refactor it gradually as you touch it — no sweeping unrelated rename passes
- Consistency takes priority over speed

---

## CHECKLIST ENFORCEMENT

- BACKEND_BUILD_CHECKLIST.md is the source of truth for WHAT gets built and at what priority
- Execution ORDER follows the Execution Model (foundation, then vertical slices), not strict top-to-bottom
- Always state which item you are on before starting it
- Mark items complete immediately after finishing and passing the Testing Gate — not in a batch later

---

## STOP-AND-ASK TRIGGERS

Stop and ask the project owner before proceeding, regardless of where you are, if:
- The task requires a schema change to a table listed under Critical-Path Rules
- The requirement is ambiguous and two reasonable implementations would behave differently for money, access control, or data retention
- You're about to mark a critical-path item complete without a corresponding failure-mode test
- A request conflicts with this file

This is the difference between a judgment call and a unilateral decision on something you don't have full context to own.

---

## STRICT PROHIBITIONS

You must NOT:
- Stub, defer, or fake any critical-path logic (payments, QR, capacity, auth, audit immutability)
- Mark anything complete that hasn't passed its Testing Gate tier
- Make critical-path decisions without flagging them first
- Re-open and re-polish closed foundational items instead of moving forward (see Definition of Done)
- Do large amounts of unplanned or unrequested work

Note: building ahead of printed checklist order to complete a vertical slice is expected under the Execution Model and is not a prohibited "skip" — as long as critical-path items inside the slice are built for real.

---

## BRANCH AND MERGE WORKFLOW

- Create a branch per checklist item (or per coherent slice step) using the naming convention (`claude/phase-<NN>-<item-slug>`).
- Once the item passes its Testing Gate, merge it into `main` immediately — do not leave it open waiting for a batch.
- `main` is always the current state of the project. The next item branches from `main`.
- There is no PR review step in a solo AI-driven build — passing the Testing Gate is the merge criterion. If the project owner wants to review before merge, they will say so; otherwise merge on green.

---

## GOVERNING RECAP

Structure beats speed on payments, QR validation, capacity locking, auth, and audit immutability — with no exception. Proportionality beats perfectionism everywhere else. Ship correct vertical slices; don't stall polishing plumbing. Every deviation from the checklist's printed content is stated and logged at the time it happens.

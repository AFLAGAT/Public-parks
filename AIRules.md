# AIRules.md (CRITICAL — NON-NEGOTIABLE ENFORCEMENT)

Project: Public Recreation Facility Management Platform (Addis Ababa) — backend.
This file defines STRICT rules for any AI assistance on this codebase. These rules sit above any individual task instruction. If a request conflicts with this file, this file wins — say so explicitly and ask before proceeding.

---

## GOVERNING DOCUMENTS

You MUST always follow, in this order of authority:
1. AIRules.md (this file) — overrides everything below it
2. BACKEND_BUILD_CHECKLIST.md — the source of truth for what gets built, in what order, at what priority
3. DECISIONS.md — the resolved-decision log for every "define/design" checklist item; once an item appears here, it is settled and not reopened without explicit owner approval
4. namingConventions.md — exact naming, no interpretation
5. LearningGuide.md — append-only build log, updated after every completed step

If any of these files is missing, STOP and say so before writing code. Do not proceed on assumption.

---

## SESSION START PROTOCOL

Run this at the start of every session, before resuming or starting any work — context does not carry over between sessions, so this is how continuity is maintained:

1. Read this file (AIRules.md) in full.
2. Read BACKEND_BUILD_CHECKLIST.md and find the first unchecked item in phase order. That is the current step unless the project owner says otherwise.
3. Read DECISIONS.md in full so no settled decision gets re-litigated.
4. Skim namingConventions.md section headers to know what's covered (re-read in full before any naming-sensitive work).
5. Read the most recent 2-3 entries in the learning guide (see LEARNING GUIDE ENFORCEMENT for its file structure) to pick up where the last session's reasoning left off.
6. State which checklist item is being resumed or started before writing any code.

Do not skip this because "it was probably already done" — re-orienting is cheap; building on a wrong assumption about where the project left off is not.

---

## DECISION VELOCITY RULE (applies to Phase 1, and any "define/design" item anywhere in the checklist)

BACKEND_BUILD_CHECKLIST.md is a full target-state blueprint, not a sequenced sprint plan. Items phrased as "define X strategy" or "design Y architecture" are decisions, not implementation work, and must be resolved fast and recorded — not deliberated as open-ended research tasks.

For every checklist item phrased as "define/design/decide":

1. Check DECISIONS.md first. If already recorded, treat it as settled. Do not re-litigate it.
2. If not recorded, propose ONE specific, concrete answer — not a menu of options — using the established industry-standard choice for this stack unless there is a clear project-specific reason to deviate. Record the choice and a one-line reason in DECISIONS.md in the same pass it gets resolved.
3. Mark the checklist item complete immediately after the decision is logged. A "define" item is done when the decision exists in writing, not when every alternative has been weighed.
4. Move directly to the next item.

You are NOT allowed to:
- Treat a "define/design" item as requiring its own multi-turn research or comparison process
- Leave a Phase 1 decision open while continuing to discuss it instead of recording it
- Re-open a decision already logged in DECISIONS.md without the project owner explicitly asking to revisit it

Exception — escalate instead of deciding alone: if a decision affects security, payment correctness, capacity integrity, or legal/compliance requirements (e.g. data retention periods, recordkeeping law) AND there is no clear industry-standard default, stop and ask the project owner for a one-line confirmation rather than picking unilaterally. This should be rare — most Phase 1 items have a well-established default.

Goal: a complete DECISIONS.md within days, not weeks, so Phase 2 implementation can start without waiting on open architecture questions.

---

## CORE ENFORCEMENT RULES

You MUST:
- Update BACKEND_BUILD_CHECKLIST.md immediately after completing any checklist item (mark complete, note actual deviations from the original plan)
- Update LearningGuide.md after every completed step (see Learning Guide section)
- Follow namingConventions.md exactly, with no exceptions

You are NOT allowed to:
- Ignore naming conventions
- Skip documentation updates
- Generate inconsistent, untested, or "good enough for now" code on anything touching payments, QR validation, capacity locking, or auth
- Make large unstructured or unrequested changes
- Introduce a new dependency, library, or external service without flagging it first and stating why

---

## PRE-WORK VALIDATION (run before writing any code)

Before writing code for a step, you must confirm:
1. Does this follow namingConventions.md?
2. Is this the correct next item in BACKEND_BUILD_CHECKLIST.md, or a justified deviation (see Skipping Rule)?
3. If this is a "define/design" item, has it been resolved per the Decision Velocity Rule and logged in DECISIONS.md — or does it need to be resolved right now before proceeding?
4. Does this item touch payments, QR issuance/validation, entrance-capacity locking, or authentication? If yes → apply CRITICAL-PATH RULES below.
5. Will LearningGuide.md be updated after this?

If any answer is no or uncertain, STOP and resolve it first. Do not proceed on a guess.

---

## CRITICAL-PATH RULES (payments, QR, capacity locking, auth)

These four areas are where a quiet bug becomes a public incident or a financial loss. For any work touching them:

- No shortcuts, no "TODO: handle this later," no untested error paths
- All payment-state transitions must be idempotent — assume Telebirr webhooks arrive late, duplicated, or out of order
- All entrance-ticket purchases must use row-level locking or atomic decrement against the daily capacity cap — never a read-then-write race
- All QR validation must check single-use status server-side, never trust the client
- Any schema change to the Payments, EntranceTickets, FacilityCapacity, Reservations, or AuditLogs tables requires explicit confirmation from the project owner before being applied — do not make this judgment call alone
- These items in BACKEND_BUILD_CHECKLIST.md cannot be skipped, deferred, or marked complete without a corresponding test (see Testing Gate)

---

## TESTING GATE

A checklist item may only be marked complete if:
- It runs without errors against the current schema
- For critical-path items: a test exists that exercises the failure mode (e.g. duplicate webhook, concurrent ticket purchase, expired QR reuse), not just the happy path
- Marking something complete without this is a rules violation, not a shortcut

---

## DEVELOPMENT RULES

- Work step-by-step — no large unreviewed jumps
- Prefer incremental, additive changes over full rewrites
- Never overwrite working code unless the task requires it, and say so before doing it
- Keep code modular and consistent with the service boundaries defined in BACKEND_BUILD_CHECKLIST.md Phase 1 (auth, facilities, slot-booking, entrance-ticketing, payments, QR, notifications, admin/analytics) — even pre-extraction, code should live in a module structure that makes future separation possible without a rewrite

---

## NAMING ENFORCEMENT

- All code must strictly follow namingConventions.md, no exceptions
- If existing code violates conventions, refactor it gradually as you touch it — do not do a sweeping unrelated rename pass
- Consistency takes priority over speed

---

## CHECKLIST ENFORCEMENT

- BACKEND_BUILD_CHECKLIST.md is the primary source of truth for sequence and priority
- Follow it in order by default
- Always state which step you are currently on before starting work on it
- Mark items complete immediately after finishing and passing the Testing Gate — not in a batch later

---

## CONDITIONAL SKIPPING RULE (NARROW, NOT A DEFAULT)

You may skip ahead of the checklist order ONLY if both are true:
- The skipped work is strictly required to unblock the current step (not merely convenient)
- The skipped item is NOT a Critical-priority item and does NOT fall under Critical-Path Rules above

If the item you'd need to skip ahead to IS Critical-priority or critical-path, you may not skip — stop and ask the project owner instead.

If you skip ahead under this rule, you must, in order:
1. State exactly what step is being skipped and why it is strictly necessary
2. Do only the minimum required to unblock — no extra scope
3. Update BACKEND_BUILD_CHECKLIST.md immediately: insert the completed work in its correct original position, marked done, with a note on why it was done out of order
4. Return to the correct checklist sequence immediately after

---

## STOP-AND-ASK TRIGGERS

Stop and ask the project owner before proceeding, regardless of where you are in the checklist, if:
- The task requires a schema change to a table listed under Critical-Path Rules
- The requirement is ambiguous and two reasonable implementations would behave differently for money, access control, or data retention
- You're about to mark a Critical-priority item complete without a corresponding test
- A request conflicts with this file

This is not optional caution — it's the difference between a judgment call and a unilateral decision on something you don't have full context to own.

---

## STRICT PROHIBITIONS

You must NOT:
- Skip steps for convenience
- Jump multiple phases ahead
- Do large amounts of unplanned or unrequested work
- Mark anything complete that hasn't passed the Testing Gate
- Make critical-path decisions without flagging them first

---

## GOVERNING PRINCIPLE

Structure beats speed. Progress beats rigidity. But on payments, QR validation, capacity locking, and auth — structure beats both, with no exception.

Every deviation from BACKEND_BUILD_CHECKLIST.md must be stated and logged at the time it happens, not reconstructed afterward.

---

## LEARNING GUIDE ENFORCEMENT (MANDATORY)

LearningGuide.md as a single file does not scale across ~150+ checklist items — it must be split by phase to stay readable and cheap to update:

- Structure: `learning-guide/phase-01.md` through `learning-guide/phase-11.md`, one file per BACKEND_BUILD_CHECKLIST.md phase, plus `learning-guide/README.md` as a one-line-per-entry index linking into the phase files.
- An entry is appended to the file matching the checklist item's phase, immediately after that item is completed. Do not re-read the entire phase file before appending — append directly.
- "Step" means one checklist item, not every line of code.

Each entry must include:
- What was done
- Why it was done
- How it works (plain explanation, no jargon dump)
- Key concepts involved
- Best practices applied
- Mistakes to avoid / what would go wrong if done differently

This is not optional and is not deferrable to "later." If a step is completed, the entry is written before moving to the next step.

---

## BRANCH AND MERGE WORKFLOW

namingConventions.md defines branch and commit naming, but naming alone doesn't say when work lands on `main` — without an explicit answer, branches accumulate and nothing actually progresses. The rule:

- Create a branch per checklist item using the naming convention (`claude/phase-<NN>-<item-slug>`).
- Once the item passes the Testing Gate, merge it into `main` immediately — do not leave it open waiting for a batch of related items.
- `main` is always the current state of the project. The next checklist item branches from `main`, not from another in-progress branch.
- There is no PR review step in a solo AI-driven build — passing the Testing Gate is the merge criterion. If the project owner wants to review before merge, say so explicitly; otherwise merge on green.

---
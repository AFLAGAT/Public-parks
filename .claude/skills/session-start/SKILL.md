---
name: session-start
description: Use at the START of every session on this codebase, before answering a question, writing code, or resuming work — runs AIRules.md's Session Start Protocol so work is placed on the correct checklist item with the correct settled decisions.
---

# Session Start (re-orientation)

Context does not carry over between sessions. Re-orient with the **minimum** reading needed to place the current item correctly. Do NOT re-read every governing document in full.

`AIRules.md` is the authority for this protocol — this skill is the operational checklist. If they ever disagree, AIRules.md wins.

## Checklist (one todo per step)

1. **Read `AIRules.md` in full.** It overrides every other doc and every task instruction.
2. **Find the current item in `BACKEND_BUILD_CHECKLIST.md`.** Under the Execution Model this is the next step in the active vertical slice, or the next genuine foundational prerequisite — **not** necessarily the next unchecked line. The active slice is: `resident → facility discovery → entrance ticket → mock payment → QR issuance → staff check-in → audit log`.
3. **Search `DECISIONS.md` for the current item's topic** (search, don't read cover to cover). Anything found is settled — do not re-litigate it.
4. **Before naming-sensitive work, read the relevant `NamingConventions.md` section** only.
5. **Read the 1–2 most recent entries in the current phase's `learning-guide/phase-NN.md`** to pick up context.
6. **State which item you are starting or resuming, out loud, before writing any code.**

## Red flags (stop — you skipped a step)

- About to write code without having named the current checklist item → do step 6 first.
- Treating the next unchecked line as the current item without checking the active slice → re-read the Execution Model.
- Re-deciding something → search `DECISIONS.md` first; it is probably already settled.
- Re-reading all five governing docs in full "to be safe" → that is the ceremony AIRules.md explicitly forbids. Targeted re-orientation only.

## Hand-off

Once oriented and the item is stated, invoke the `checklist-item` skill before writing code.

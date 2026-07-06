# Start here

This is the backend for the Public Recreation Facility Management Platform (Addis Ababa). Before doing anything — answering a question, writing code, or resuming work — read these files in order:

1. **AIRules.md** — binding rules for how work happens on this codebase. Run its Session Start Protocol now, before reading further.
2. **BACKEND_BUILD_CHECKLIST.md** — what gets built, in what order, at what priority. Find the first unchecked item.
3. **DECISIONS.md** — every architecture/stack decision already made. Do not re-decide anything logged here.
4. **namingConventions.md** — exact naming for every layer. Follow it exactly, no exceptions.
5. **learning-guide/** — append-only build log, one file per phase. Check the most recent entries for context; append a new one after every completed checklist item.

If any of these files is missing or you're unsure which checklist item is current, say so before proceeding. Do not guess.

# Project skills

Three project-scoped skills in `.claude/skills/` operationalize the rules above as trigger-able checklists. They do not replace the governing docs — AIRules.md remains the authority — they make the workflow self-reinforcing. Invoke them via the Skill tool:

- **`session-start`** — invoke at the start of every session, before answering, coding, or resuming. Runs AIRules.md's Session Start Protocol (this replaces doing step-by-step re-orientation from memory).
- **`checklist-item`** — invoke when starting, building, or closing any BACKEND_BUILD_CHECKLIST.md item. Runs Pre-Work Validation, the tiered Testing Gate, and the Definition of Done.
- **`critical-path`** — invoke whenever work touches payments/Telebirr, QR, capacity locking, auth, or audit immutability. Enforces the Critical-Path Rules, stop-and-ask triggers, and the failure-mode Testing Gate.
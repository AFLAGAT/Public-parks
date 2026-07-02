# Design: Standard Request Validation Layer

**Checklist item:** Phase 2 — "Create standard request validation layer" (Priority: Critical)
**Branch:** `claude/phase-02-create-standard-request-validation-layer`
**Date:** 2026-07-01
**Status:** Design approved; pending spec review before implementation planning.

---

## Purpose

Validate and normalize every external input at the API boundary before it reaches
business logic. This is the first line of the platform's security posture (OWASP
A03/A04): reject unexpected fields, invalid enum values, malformed IDs, unsafe
strings, impossible dates, invalid quantities, and cross-tenant identifiers before
any handler runs.

Per DECISIONS.md, the library is **Zod**, applied at every API boundary with
unknown-field rejection. This item builds the reusable machinery that makes that
policy automatic for all future endpoints.

## Scope decision (settled during brainstorming)

- **Owns the error envelope now.** A validation failure produces the project's
  canonical shape `{ error: { code, message, details, correlationId } }` (see
  NamingConventions.md §4 and the "API error response shape" decision). Rationale:
  this is a Critical item every endpoint depends on; shipping validation whose
  failures emit a non-conforming shape would force the later
  "Create centralized error handling" item to rework the contract. `correlationId`
  is a fixed placeholder here and gets its real value when the structured-logging
  item lands.
- **Does not** build general error handling for non-validation errors. The later
  "Create centralized error handling" item generalizes this filter's pattern to
  auth, permission, conflict, payment, and infrastructure failures.
- **Does not** add controllers or DTOs for real domains (those are Phase 3+). It
  ships only the reusable validation machinery plus a test-only fixture endpoint.

## Approach (chosen)

**Global Zod validation pipe, schema attached per-DTO.** One `ZodValidationPipe`
registered application-wide (fails closed — a route with a schema is always
validated; there is no per-route opt-in to forget). Each route's DTO carries its
Zod schema; the pipe resolves it and validates the incoming body/query/params.

Rejected alternatives:
- *Per-route pipe instances* (`new ZodValidationPipe(schema)` on every param) —
  fails open: a forgotten annotation silently skips validation on a security
  control. Unacceptable for a Critical item.
- *`nestjs-zod` library* — introduces a new dependency (AIRules requires flagging)
  and hides the error mapping we specifically want to own for the envelope.

## Architecture

New shared location: `src/common/validation/` (validation is cross-cutting, not
owned by any domain module). A `ValidationModule` wires the global pipe and
filter and is imported by `AppModule`.

### Components

| Component | File | Responsibility |
|---|---|---|
| `ZodValidationPipe` | `src/common/validation/zod-validation.pipe.ts` | Implements NestJS `PipeTransform`. Resolves the Zod schema bound to the argument metatype, runs `safeParse`, returns the parsed (typed, normalized) value or throws `RequestValidationException`. |
| `RequestValidationException` | `src/common/validation/request-validation.exception.ts` | Carries `code: 'VALIDATION_FAILED'`, a human message, and structured `details` (field path → messages) flattened from the Zod error. |
| `ValidationExceptionFilter` | `src/common/validation/validation-exception.filter.ts` | NestJS `ExceptionFilter` for `RequestValidationException`. Renders the fixed envelope, HTTP 400. |
| `createZodDto` | `src/common/validation/create-zod-dto.util.ts` | Small (~15-line) helper turning a Zod schema into a class NestJS can use as a param metatype and that carries the schema for the pipe to find. Keeps schemas colocated in `<resource>.types.ts` per NamingConventions.md §3. |
| `ValidationModule` | `src/common/validation/validation.module.ts` | Registers `ZodValidationPipe` as `APP_PIPE` and `ValidationExceptionFilter` as `APP_FILTER`. Imported by `AppModule`. |
| `CORRELATION_ID_PLACEHOLDER` | (constant, colocated with the filter) | Temporary fixed value for `error.correlationId` until the structured-logging item supplies the real per-request id. |

### Naming note

Per the DECISIONS.md entry "Class-suffix naming for NestJS framework primitives"
(added alongside this item), `ZodValidationPipe` and `ValidationExceptionFilter`
use NestJS's idiomatic suffixes, which extend — do not override —
NamingConventions.md §3. Files use kebab-case (`zod-validation.pipe.ts`).

## Data flow

```
HTTP request
  -> global ZodValidationPipe
       - resolves the route's Zod schema from the DTO metatype
       - schema.safeParse(input) with .strict() (unknown fields rejected)
       - success: typed, coerced, normalized object handed to the controller
       - failure: throw RequestValidationException(flattenedDetails)
  -> controller receives fully-trusted input
  (on failure)
  -> ValidationExceptionFilter
       - 400 { error: { code: 'VALIDATION_FAILED', message, details, correlationId } }
```

Schemas use `.strict()` so unknown fields are rejected (not stripped) — an
explicit OWASP requirement. Coercion/normalization (e.g. trimming, numeric query
params) is expressed in the schema, so the controller never sees raw strings.

## Error handling

Every validation failure — invalid enum, unknown field, malformed UUID, impossible
date, out-of-range quantity, wrong type — maps to a single `400 VALIDATION_FAILED`
with per-field `details`, e.g.:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed.",
    "details": { "quantity": ["Expected a positive integer"], "visitDate": ["Invalid date"] },
    "correlationId": "not-yet-wired"
  }
}
```

`details` keys are the camelCase request field names (matching the API contract in
NamingConventions.md §4), never internal snake_case column names.

## Testing (Testing Gate)

1. **Unit tests — `ZodValidationPipe`:** valid input passes through typed;
   coercion works (string query -> number); unknown field rejected; invalid enum
   rejected; malformed UUID rejected; missing required field rejected; a route
   with no schema is passed through unchanged (documented behavior).
2. **Unit tests — `ValidationExceptionFilter`:** a `RequestValidationException`
   renders the exact envelope shape and 400 status; `details` preserves field
   paths; non-validation exceptions are not swallowed.
3. **Integration test — end-to-end:** a **test-only fixture controller** (defined
   inside the test suite, never in `src/`) with one endpoint whose DTO has a
   representative schema. Assert: valid request succeeds; invalid request returns
   the real 400 envelope through the actual Nest pipeline (pipe + filter wired as
   they are in production).

These run in the existing Vitest unit suite (filter/pipe) and the NestJS testing
harness; no database is required, so they belong in `test:unit`.

## Out of scope (explicitly deferred)

- Real domain DTOs/schemas (Phase 3+ as each resource is built).
- General (non-validation) exception handling — later Phase 2 item.
- Real `correlationId` generation — depends on the structured-logging item.
- Response/pagination envelope — separate Phase 2 item.
- Rate limiting, auth, RBAC — separate Phase 2/4 items.

## Definition of done

- `ZodValidationPipe`, `RequestValidationException`, `ValidationExceptionFilter`,
  `createZodDto`, and `ValidationModule` implemented under `src/common/validation/`.
- Global pipe + filter registered and imported by `AppModule`.
- All tests above pass; `build`, `lint`, and `typecheck` green.
- DECISIONS.md naming entry present (done).
- Checklist item marked complete; `learning-guide/phase-02.md` entry appended;
  README index line added.
- Merged to `main` on green per the branch-and-merge workflow.

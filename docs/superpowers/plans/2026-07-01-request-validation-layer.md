# Request Validation Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, default-on Zod request-validation layer for the NestJS backend that validates/normalizes all API input and renders failures as the project's canonical error envelope.

**Architecture:** A single global `ZodValidationPipe` (registered via `APP_PIPE`) validates each route's body/query/params against a Zod schema carried on the DTO class (produced by a `createZodDto` helper). Validation failures throw `RequestValidationException`, which a global `ValidationExceptionFilter` (registered via `APP_FILTER`) renders as `{ error: { code, message, details, correlationId } }` with HTTP 400. All new code lives in `src/common/validation/`.

**Tech Stack:** NestJS 10, Zod 3, Vitest 2, TypeScript (strict). No new dependencies.

## Global Constraints

- **Validation library:** Zod (DECISIONS.md). No `nestjs-zod` or other validation dependency.
- **Unknown-field rejection:** object schemas use `.strict()` — reject unknown fields, do not strip (OWASP A03/A04).
- **Error envelope (verbatim):** `{ "error": { "code", "message", "details", "correlationId" } }`; `code` is UPPER_SNAKE_CASE (NamingConventions.md §4). Validation code is `VALIDATION_FAILED`.
- **`correlationId`:** fixed placeholder `'not-yet-wired'` (constant `CORRELATION_ID_PLACEHOLDER`) until the structured-logging item wires the real value.
- **`details` keys:** camelCase request field paths, never snake_case DB columns.
- **Naming:** files kebab-case; NestJS primitives use idiomatic suffixes (`ZodValidationPipe`, `ValidationExceptionFilter`) per the DECISIONS.md "Class-suffix naming for NestJS framework primitives" entry. TypeScript strict — no `any` that eslint rejects.
- **No new npm dependency** without flagging (AIRules). This plan adds none.
- **Testing Gate:** item is Critical; failure-mode tests (unknown field, invalid enum, malformed id) must exist and pass before completion.
- **Branch:** `claude/phase-02-create-standard-request-validation-layer`; merge to `main` on green.
- **Verify commands:** `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test:unit` must all pass before the final commit.

## File Structure

- `src/common/validation/create-zod-dto.util.ts` — `createZodDto(schema)` → DTO class carrying `zodSchema`.
- `src/common/validation/request-validation.exception.ts` — `RequestValidationException` (code + details).
- `src/common/validation/zod-validation.pipe.ts` — `ZodValidationPipe` + internal `flattenZodError`.
- `src/common/validation/validation-exception.filter.ts` — `ValidationExceptionFilter` + `CORRELATION_ID_PLACEHOLDER`.
- `src/common/validation/validation.module.ts` — `ValidationModule` registering `APP_PIPE` + `APP_FILTER`.
- `src/app.module.ts` — import `ValidationModule` (modify).
- Co-located `*.spec.ts` test files for each unit + one end-to-end spec with a fixture controller.

---

### Task 1: `createZodDto` helper

**Files:**
- Create: `src/common/validation/create-zod-dto.util.ts`
- Test: `src/common/validation/create-zod-dto.util.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createZodDto(schema: ZodTypeAny): ZodDtoStatic` where `ZodDtoStatic` is a constructable class with a static `zodSchema: ZodTypeAny`. Pipe (Task 3) reads `metatype.zodSchema`.

- [ ] **Step 1: Write the failing test**

```ts
// src/common/validation/create-zod-dto.util.spec.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createZodDto } from './create-zod-dto.util';

describe('createZodDto', () => {
  it('returns a constructable class carrying the schema on a static property', () => {
    const schema = z.object({ name: z.string() }).strict();
    const Dto = createZodDto(schema);

    expect(typeof Dto).toBe('function');
    expect(Dto.zodSchema).toBe(schema);
    expect(new Dto()).toBeInstanceOf(Dto);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/common/validation/create-zod-dto.util.spec.ts`
Expected: FAIL — cannot find module `./create-zod-dto.util`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/common/validation/create-zod-dto.util.ts
import { ZodTypeAny } from 'zod';

export interface ZodDtoStatic {
  new (): unknown;
  zodSchema: ZodTypeAny;
}

/**
 * Turns a Zod schema into a class NestJS can use as a route param metatype.
 * The class carries the schema on `zodSchema` so the global ZodValidationPipe
 * can resolve it from `ArgumentMetadata.metatype`. Keeps schemas colocated in
 * `<resource>.types.ts` per NamingConventions.md §3.
 */
export function createZodDto(schema: ZodTypeAny): ZodDtoStatic {
  class ZodDto {
    static zodSchema: ZodTypeAny = schema;
  }
  return ZodDto as ZodDtoStatic;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/common/validation/create-zod-dto.util.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/common/validation/create-zod-dto.util.ts src/common/validation/create-zod-dto.util.spec.ts
git commit -m "phase-02: add createZodDto helper for validation layer [checklist:create-standard-request-validation-layer]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `RequestValidationException`

**Files:**
- Create: `src/common/validation/request-validation.exception.ts`
- Test: `src/common/validation/request-validation.exception.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `class RequestValidationException extends Error` with readonly `code: 'VALIDATION_FAILED'` and readonly `details: Record<string, string[]>`. Consumed by the pipe (Task 3, throws it) and filter (Task 4, renders it).

- [ ] **Step 1: Write the failing test**

```ts
// src/common/validation/request-validation.exception.spec.ts
import { describe, expect, it } from 'vitest';
import { RequestValidationException } from './request-validation.exception';

describe('RequestValidationException', () => {
  it('carries a stable code, message, and structured details', () => {
    const details = { quantity: ['Expected a positive integer'] };
    const error = new RequestValidationException(details);

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Request validation failed.');
    expect(error.details).toEqual(details);
    expect(error.name).toBe('RequestValidationException');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/common/validation/request-validation.exception.spec.ts`
Expected: FAIL — cannot find module `./request-validation.exception`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/common/validation/request-validation.exception.ts

/**
 * Thrown by ZodValidationPipe when request input fails schema validation.
 * Caught and rendered as the canonical error envelope by
 * ValidationExceptionFilter. `details` maps each failing field path (camelCase,
 * dot-joined) to its messages.
 */
export class RequestValidationException extends Error {
  readonly code = 'VALIDATION_FAILED' as const;

  constructor(readonly details: Record<string, string[]>) {
    super('Request validation failed.');
    this.name = 'RequestValidationException';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/common/validation/request-validation.exception.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/common/validation/request-validation.exception.ts src/common/validation/request-validation.exception.spec.ts
git commit -m "phase-02: add RequestValidationException for validation layer [checklist:create-standard-request-validation-layer]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `ZodValidationPipe`

**Files:**
- Create: `src/common/validation/zod-validation.pipe.ts`
- Test: `src/common/validation/zod-validation.pipe.spec.ts`

**Interfaces:**
- Consumes: `RequestValidationException` (Task 2); `ZodDtoStatic` shape (Task 1) — reads `metatype.zodSchema`.
- Produces: `class ZodValidationPipe implements PipeTransform` with `transform(value: unknown, metadata: ArgumentMetadata): unknown`. Passes through when the metatype carries no `zodSchema`; otherwise returns `schema.parse` output or throws `RequestValidationException`.

- [ ] **Step 1: Write the failing test**

```ts
// src/common/validation/zod-validation.pipe.spec.ts
import { describe, expect, it } from 'vitest';
import type { ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';
import { RequestValidationException } from './request-validation.exception';
import { createZodDto } from './create-zod-dto.util';

const schema = z
  .object({
    name: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
    kind: z.enum(['pool', 'tennis']),
  })
  .strict();
const Dto = createZodDto(schema);
const meta = (metatype: unknown): ArgumentMetadata =>
  ({ type: 'body', metatype: metatype as ArgumentMetadata['metatype'], data: undefined });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  it('returns parsed, coerced data for valid input', () => {
    const result = pipe.transform({ name: 'a', quantity: '3', kind: 'pool' }, meta(Dto));
    expect(result).toEqual({ name: 'a', quantity: 3, kind: 'pool' });
  });

  it('passes through unchanged when the metatype carries no schema', () => {
    const value = { anything: true };
    expect(pipe.transform(value, meta(Object))).toBe(value);
  });

  it('rejects unknown fields', () => {
    expect(() => pipe.transform({ name: 'a', quantity: 1, kind: 'pool', extra: 1 }, meta(Dto)))
      .toThrow(RequestValidationException);
  });

  it('rejects invalid enum values', () => {
    expect(() => pipe.transform({ name: 'a', quantity: 1, kind: 'soccer' }, meta(Dto)))
      .toThrow(RequestValidationException);
  });

  it('rejects missing required fields and reports the field path', () => {
    try {
      pipe.transform({ quantity: 1, kind: 'pool' }, meta(Dto));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RequestValidationException);
      expect((error as RequestValidationException).details).toHaveProperty('name');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/common/validation/zod-validation.pipe.spec.ts`
Expected: FAIL — cannot find module `./zod-validation.pipe`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/common/validation/zod-validation.pipe.ts
import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodTypeAny } from 'zod';
import { RequestValidationException } from './request-validation.exception';

interface SchemaCarrier {
  zodSchema?: ZodTypeAny;
}

function flattenZodError(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

/**
 * Global pipe. Validates a route argument against the Zod schema carried on its
 * DTO metatype (see createZodDto). Arguments without a schema (plain Object,
 * String, primitives) pass through untouched. On failure throws
 * RequestValidationException, rendered as the canonical envelope by
 * ValidationExceptionFilter.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = (metadata.metatype as SchemaCarrier | undefined)?.zodSchema;
    if (!schema) {
      return value;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new RequestValidationException(flattenZodError(result.error));
    }
    return result.data;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/common/validation/zod-validation.pipe.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/common/validation/zod-validation.pipe.ts src/common/validation/zod-validation.pipe.spec.ts
git commit -m "phase-02: add global ZodValidationPipe for validation layer [checklist:create-standard-request-validation-layer]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `ValidationExceptionFilter`

**Files:**
- Create: `src/common/validation/validation-exception.filter.ts`
- Test: `src/common/validation/validation-exception.filter.spec.ts`

**Interfaces:**
- Consumes: `RequestValidationException` (Task 2).
- Produces: `class ValidationExceptionFilter implements ExceptionFilter` (`@Catch(RequestValidationException)`) and exported `const CORRELATION_ID_PLACEHOLDER = 'not-yet-wired'`. Writes `400 { error: { code, message, details, correlationId } }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/common/validation/validation-exception.filter.spec.ts
import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import {
  CORRELATION_ID_PLACEHOLDER,
  ValidationExceptionFilter,
} from './validation-exception.filter';
import { RequestValidationException } from './request-validation.exception';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('ValidationExceptionFilter', () => {
  const filter = new ValidationExceptionFilter();

  it('renders the canonical error envelope with 400', () => {
    const { host, status, json } = mockHost();
    const details = { name: ['Required'] };

    filter.catch(new RequestValidationException(details), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details,
        correlationId: CORRELATION_ID_PLACEHOLDER,
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/common/validation/validation-exception.filter.spec.ts`
Expected: FAIL — cannot find module `./validation-exception.filter`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/common/validation/validation-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { RequestValidationException } from './request-validation.exception';

/**
 * Temporary correlation id until the structured-logging item wires a real
 * per-request id into the envelope. Referenced here so the field is present and
 * clients can rely on its shape from day one.
 */
export const CORRELATION_ID_PLACEHOLDER = 'not-yet-wired';

@Catch(RequestValidationException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: RequestValidationException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.BAD_REQUEST).json({
      error: {
        code: exception.code,
        message: exception.message,
        details: exception.details,
        correlationId: CORRELATION_ID_PLACEHOLDER,
      },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/common/validation/validation-exception.filter.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/common/validation/validation-exception.filter.ts src/common/validation/validation-exception.filter.spec.ts
git commit -m "phase-02: add ValidationExceptionFilter rendering canonical envelope [checklist:create-standard-request-validation-layer]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `ValidationModule`, wiring, and end-to-end test

**Files:**
- Create: `src/common/validation/validation.module.ts`
- Create: `src/common/validation/validation.e2e.spec.ts`
- Modify: `src/app.module.ts` (import `ValidationModule`)

**Interfaces:**
- Consumes: `ZodValidationPipe` (Task 3), `ValidationExceptionFilter` (Task 4), `createZodDto` (Task 1).
- Produces: `class ValidationModule` registering `APP_PIPE` = `ZodValidationPipe` and `APP_FILTER` = `ValidationExceptionFilter`. After this task, importing `ValidationModule` into an HTTP Nest app makes validation global.

- [ ] **Step 1: Write the failing end-to-end test**

Uses a test-only fixture controller (defined in the spec, never in `src/` production code) and Node's global `fetch` against an ephemeral listener — no `supertest` dependency, no database.

```ts
// src/common/validation/validation.e2e.spec.ts
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Body, Controller, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import { ValidationModule } from './validation.module';
import { createZodDto } from './create-zod-dto.util';

const createThingSchema = z
  .object({ name: z.string().min(1), quantity: z.coerce.number().int().positive() })
  .strict();
class CreateThingDto extends createZodDto(createThingSchema) {}

@Controller('things')
class FixtureThingsController {
  @Post()
  create(@Body() body: CreateThingDto): { received: unknown } {
    return { received: body };
  }
}

describe('validation layer (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ValidationModule],
      controllers: [FixtureThingsController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts valid input and returns coerced data', async () => {
    const res = await fetch(`${baseUrl}/things`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'court a', quantity: '2' }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ received: { name: 'court a', quantity: 2 } });
  });

  it('rejects an unknown field with the canonical 400 envelope', async () => {
    const res = await fetch(`${baseUrl}/things`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'court a', quantity: 2, sneaky: true }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error).toHaveProperty('details');
    expect(body.error).toHaveProperty('correlationId');
  });

  it('rejects an invalid field value with 400', async () => {
    const res = await fetch(`${baseUrl}/things`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', quantity: -1 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(body.error.details).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/common/validation/validation.e2e.spec.ts`
Expected: FAIL — cannot find module `./validation.module`.

- [ ] **Step 3: Implement `ValidationModule`**

```ts
// src/common/validation/validation.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from './zod-validation.pipe';
import { ValidationExceptionFilter } from './validation-exception.filter';

/**
 * Registers request validation globally: every route argument with a Zod schema
 * (via createZodDto) is validated by ZodValidationPipe, and validation failures
 * are rendered as the canonical error envelope by ValidationExceptionFilter.
 * Imported by AppModule.
 */
@Module({
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ValidationExceptionFilter },
  ],
})
export class ValidationModule {}
```

- [ ] **Step 4: Wire `ValidationModule` into `AppModule`**

Add the import and include it in the `imports` array of `src/app.module.ts`:

```ts
import { ValidationModule } from './common/validation/validation.module';
```

Add `ValidationModule` to the `@Module({ imports: [...] })` array (place it right after `ConfigModule`, before `DatabaseModule`).

- [ ] **Step 5: Run the e2e test to verify it passes**

Run: `npx vitest run src/common/validation/validation.e2e.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full verification suite**

Run each; all must pass:
```bash
npm run build
npm run lint
npm run typecheck
npm run test:unit
```
Expected: build clean; lint clean; typecheck clean; all tests pass (existing 78 + new: 1 + 1 + 5 + 1 + 3 = 89 total).

- [ ] **Step 7: Commit**

```bash
git add src/common/validation/validation.module.ts src/common/validation/validation.e2e.spec.ts src/app.module.ts
git commit -m "phase-02: wire global ValidationModule into AppModule with e2e coverage [checklist:create-standard-request-validation-layer]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Documentation and checklist close-out

**Files:**
- Modify: `BACKEND_BUILD_CHECKLIST.md` (mark item complete)
- Modify: `learning-guide/phase-02.md` (append entry)
- Modify: `learning-guide/README.md` (add index line)

- [ ] **Step 1: Mark the checklist item complete**

In `BACKEND_BUILD_CHECKLIST.md`, change the Phase 2 item from:
`- [ ] **Create standard request validation layer.**`
to:
`- [x] **Create standard request validation layer.**`
and append a `**Notes:**` line summarizing: global Zod pipe + exception filter, `createZodDto` helper, `.strict()` unknown-field rejection, canonical `VALIDATION_FAILED` envelope with placeholder `correlationId`, `src/common/validation/`, no new dependency.

- [ ] **Step 2: Append the learning-guide entry**

Append a new `## Create standard request validation layer` section to `learning-guide/phase-02.md` covering: what was done, why (OWASP A03/A04, default-on fails-closed), how it works (pipe reads `zodSchema` off DTO metatype; filter renders envelope), key concepts (NestJS `APP_PIPE`/`APP_FILTER` global enhancers, Zod `.strict()`/`safeParse`, `createZodDto`), best practices (global registration so validation can't be forgotten; schema-owned coercion; envelope owned now to avoid rework), and mistakes to avoid (per-route pipes fail open; stripping vs rejecting unknown fields; leaking snake_case column names into `details`).

- [ ] **Step 3: Add the README index line**

Under `## Phase 2 — Backend Foundation` in `learning-guide/README.md`, add:
`- [Create standard request validation layer](phase-02.md#create-standard-request-validation-layer) — global Zod pipe + exception filter, createZodDto, strict unknown-field rejection, canonical VALIDATION_FAILED envelope.`

- [ ] **Step 4: Commit**

```bash
git add BACKEND_BUILD_CHECKLIST.md learning-guide/phase-02.md learning-guide/README.md
git commit -m "phase-02: mark request validation layer complete and log learning-guide entry [checklist:create-standard-request-validation-layer]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Merge to main**

Per the branch-and-merge workflow (item passed the Testing Gate on green):
```bash
git checkout main
git merge --no-ff claude/phase-02-create-standard-request-validation-layer
```

---

## Self-Review

**Spec coverage:**
- Zod global pipe, per-DTO schema → Task 3 + Task 5 (wiring). ✓
- Unknown-field rejection via `.strict()` → Global Constraints + Task 3/5 tests. ✓
- Canonical envelope owned now, `correlationId` placeholder → Task 4. ✓
- `createZodDto` colocating schemas → Task 1. ✓
- `RequestValidationException` with code + details → Task 2. ✓
- `ValidationModule` registration + `AppModule` wiring → Task 5. ✓
- `src/common/validation/` location → all tasks. ✓
- Testing Gate (unit pipe/filter + e2e fixture controller, no DB, no supertest) → Tasks 1–5. ✓
- Naming decision reference → Global Constraints. ✓ (DECISIONS.md entry already committed.)
- Docs/checklist/learning-guide close-out + merge → Task 6. ✓

**Placeholder scan:** No TBD/TODO. `correlationId: 'not-yet-wired'` and `CORRELATION_ID_PLACEHOLDER` are intentional, documented stubs, not plan placeholders. All code steps contain complete code.

**Type consistency:** `zodSchema` static property is defined in Task 1 and read in Task 3 (`SchemaCarrier.zodSchema`) — names match. `RequestValidationException` `code`/`details`/`message` defined in Task 2, used identically in Tasks 3 (throw), 4 (render), and the e2e assertions. `createZodDto` return type `ZodDtoStatic` used consistently. `CORRELATION_ID_PLACEHOLDER` exported from Task 4, imported in its own spec. Verify count (89) is illustrative; the gate is "all pass", not a specific number.

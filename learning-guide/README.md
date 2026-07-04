# Learning Guide

Append-only build log for the Public Recreation Facility Management Platform backend. One file per phase of `BACKEND_BUILD_CHECKLIST.md`. An entry is appended to the matching phase file immediately after a checklist item is completed.

Entry depth is tiered by risk (see AIRules.md → Learning Guide Enforcement):

- **Critical-path items** (payments, QR, capacity locking, auth, audit immutability): full entry — what was done, why, how it works, key concepts, best practices, and mistakes to avoid.
- **All other items:** concise entry — what was done, why, and any non-obvious gotcha (3–6 sentences). Do not pad plumbing into a six-heading essay.

This README is a one-line-per-entry index linking into the phase files. Add a new line here every time a phase file gets a new entry.

## Phase 1 — System Architecture

- [Define bounded backend modules](phase-01.md#define-bounded-backend-modules) — modular monolith, folder-per-domain, interfaces between modules.
- [Separate slot reservation and entrance ticket domains](phase-01.md#separate-slot-reservation-and-entrance-ticket-domains) — two booking models, no generic `reservations` table.
- [Design the shared payable contract](phase-01.md#design-the-shared-payable-contract) — `payable_type` + `payable_id`, service-layer ownership validation.
- [Design the shared QR validation contract](phase-01.md#design-the-shared-qr-validation-contract) — signed token of QR record ID only, server-authoritative state.
- [Bake offline-first staff sync into architecture](phase-01.md#bake-offline-first-staff-sync-into-architecture) — daily facility/date bundle, batched push with deterministic idempotency key.
- [Define staff sync conflict resolution rules](phase-01.md#define-staff-sync-conflict-resolution-rules) — first valid scan wins, rejections logged with reason.
- [Make Telebirr webhook idempotency a core design rule](phase-01.md#make-telebirr-webhook-idempotency-a-core-design-rule) — `webhook_events` unique by provider event ID, row-locked payment processing.
- [Define entrance capacity integrity strategy](phase-01.md#define-entrance-capacity-integrity-strategy) — atomic conditional UPDATE, no row returned = sold out.
- [Define immutable audit logging as a platform primitive](phase-01.md#define-immutable-audit-logging-as-a-platform-primitive) — INSERT-only app role, month partitions from migration 1.
- [Define API versioning strategy](phase-01.md#define-api-versioning-strategy) — URL path versioning under `/v1`.
- [Define consistent API error shapes](phase-01.md#define-consistent-api-error-shapes) — fixed `{ error: { code, message, details, correlationId } }` envelope with stable string codes.
- [Design security architecture against OWASP Top 10](phase-01.md#design-security-architecture-against-owasp-top-10) — baseline library set per OWASP category, default-deny posture.
- [Define rate limiting architecture by endpoint, user, and IP](phase-01.md#define-rate-limiting-architecture-by-endpoint-user-and-ip) — Redis-backed multi-tier limiter (IP, user, OTP).
- [Define deployment architecture](phase-01.md#define-deployment-architecture) — containerized stateless API + workers, managed Postgres + Redis, per-env credentials.
- [Define horizontal scaling posture](phase-01.md#define-horizontal-scaling-posture) — 12-factor stateless processes, all session/lock/counter state externalized.
- [Define database scaling path](phase-01.md#define-database-scaling-path) — PgBouncer pooling, month-partition known-hot tables, primary-only for conflict-sensitive reads.
- [Define queue-based background processing](phase-01.md#define-queue-based-background-processing) — BullMQ on Redis, idempotent handlers with DLQ.
- [Define observability architecture](phase-01.md#define-observability-architecture) — pino JSON logging, correlation IDs, hosted APM.
- [Define backup and disaster recovery architecture](phase-01.md#define-backup-and-disaster-recovery-architecture) — provider PITR, 35-day retention, encrypted, quarterly restore drills.
- _Define privacy and data retention principles — **unchecked**, blocked on legal/government answer._

## Phase 2 — Backend Foundation

- [Initialize production-oriented project structure](phase-02.md#initialize-production-oriented-project-structure) — NestJS skeleton with the ten domain module folders, strict TS, Vitest, `/v1` global prefix; build + smoke test green.
- [Create configuration management layer](phase-02.md#create-configuration-management-layer) — `@nestjs/config` + Zod, section-composed schema, `AppConfigService` typed accessor, fail-fast on missing/malformed env at startup.
- [Set up secrets management](phase-02.md#set-up-secrets-management) — platform-agnostic policy logged in DECISIONS.md, `SECRET_REGISTRY` + `assertNoDevSecretPlaceholders` guard refuses prod/staging boot on known placeholder values.
- [Create fully separated environments](phase-02.md#create-fully-separated-environments) — `Environment separation` decision logged, `DEV_INFRA_REGISTRY` + `assertNoDevInfraValues` guard refuses prod/staging boot when a connection string matches localhost/dev patterns.
- [Provision PostgreSQL with geospatial support](phase-02.md#provision-postgresql-with-geospatial-support) — `postgis/postgis:16-3.4` via Docker Compose for local dev, `DB_PRIMARY_URL` Zod-validated + registered in both registries, `DatabaseConfigService` accessor.
- [Set up ORM or query builder with migration discipline](phase-02.md#set-up-orm-or-query-builder-with-migration-discipline) — Drizzle ORM + Drizzle Kit wired into NestJS via `DatabaseModule` with `DRIZZLE_CLIENT` and `DRIZZLE_POOL` tokens, pool lifecycle via `OnApplicationShutdown`, first migration for PostGIS enablement, `dotenv`-aware migration runner, `tsx`-based script, `@types/pg` moved to devDependencies.
- [Create API documentation pipeline](phase-02.md#create-api-documentation-pipeline) — OpenAPI/Swagger via `@nestjs/swagger`, Swagger UI at `/docs` (disabled in production by default), standalone generator script without live DB, `APP_ENABLE_DOCS` env override, bearer auth placeholder for future JWT.
- [API documentation pipeline — remediation (Phase 2 verification)](phase-02.md#api-documentation-pipeline--remediation-phase-2-verification) — Fixed dependency incompatibility (Swagger 11 → 8 for NestJS 10 compat), closed test gaps with behavioral tests, added `@Inject()` for esbuild DI, tightened Zod boolean coercion to reject malformed values, improved generator reliability with try/catch/finally, documented `APP_ENABLE_DOCS` in `.env.example`.
- [API documentation pipeline — Phase 2 verification follow-up](phase-02.md#api-documentation-pipeline--phase-2-verification-follow-up) — Corrected docs exposure policy (staging now disabled by default), fixed 9 lint errors, improved generator type safety and cleanup, removed unrelated checklist restructuring, corrected evidence inaccuracy about `NamingConventions.md`.
- [API documentation pipeline — Phase 2 final correction](phase-02.md#api-documentation-pipeline--phase-2-final-correction) — Prevented duplicate shutdown in generator, strengthened auth-scheme test to fail unconditionally on malformed schemes, removed stale checklist wording, corrected .env.example prose, audited and indexed the correction.

- [Set up testing framework and test database workflow](phase-02.md#set-up-testing-framework-and-test-database-workflow) — test-suite separation (unit vs integration), disposable Docker Compose PostGIS database, Node orchestrator with Docker lifecycle, database safety guard, integration smoke test against real PostGIS, fixture workflow documentation, lint+typecheck coverage for test files.
- [Testing framework — remediation (Phase 2 verification)](phase-02.md#testing-framework--remediation-phase-2-verification) — orchestration hardening (no shell interpolation, port validation, unique Compose project, signal handling, idempotent teardown), database guard hardening (URL constructor, 0.0.0.0 rejection, spoofed-name rejection, credential redaction), guard test expansion (27 tests), Vitest setup file, Drizzle client smoke test with `__drizzle_migrations` hash verification, tsconfig/build boundaries, fixture documentation corrections (PoolClient transaction isolation, DDL transactional correction).
- [Create standard request validation layer](phase-02.md#create-standard-request-validation-layer) — global Zod pipe + exception filter, createZodDto, strict unknown-field rejection, canonical VALIDATION_FAILED envelope.
- [Create standard response and pagination helpers](phase-02.md#create-standard-response-and-pagination-helpers) — bounded `pageSize`, versioned endpoint-validated Base64URL cursors, and fetch-one-extra `{ data, pagination }` response construction.
- [Add Redis, security key rings, and provider boundaries](phase-02.md#add-redis-security-key-rings-and-provider-boundaries) — shared Redis controls, typed secret key rings, AES-GCM fields, Helmet/CORS, and auth's narrow OTP delivery port.
- [Create structured logging foundation](phase-02.md#create-structured-logging-foundation) — global Pino JSON logging, safe correlation-ID propagation, minimal HTTP metadata, status-aware levels, typed operational context, and logger-level sensitive-field redaction.
- [Create centralized error handling](phase-02.md#create-centralized-error-handling) — single global `AllExceptionsFilter` + stable `ErrorCode` taxonomy + `ApplicationException` base rendering the canonical envelope for validation/application/framework/unknown failures; superseded and removed the per-exception validation filter.
- [Set up authentication middleware skeleton](phase-02.md#set-up-authentication-middleware-skeleton) — global default-deny `AuthenticationGuard`, explicit `@Public()` allowlist, server-owned authenticated-actor request context, and critical failure-mode coverage for anonymous, arbitrary-bearer, and request-property spoofing attempts.

## Phase 3 — Database Design

- [Model users with client-neutral identity](phase-03.md#model-users-with-client-neutral-identity) — shared UUID identity with normalized unique phone/email channels, verification-state constraints, no embedded roles/clients/credentials, and real PostgreSQL failure-mode coverage.
- [Model facilities with operational classification](phase-03.md#model-facilities-with-operational-classification) — facility-type-owned slot/entrance classification, SRID-enforced PostGIS points, meter-based GiST discovery index, and real geospatial/constraint tests.
- [Model authentication, SMS revisions, and immutable audit records](phase-03.md#model-authentication-sms-revisions-and-immutable-audit-records) — credential/session/RBAC tables, scope-ready SMS revision state, and monthly append-only audit partitions.

## Phase 4 — Authentication and Security

- [Implement resident OTP and Super Admin MFA authentication](phase-04.md#implement-resident-otp-and-super-admin-mfa-authentication) — digest-only OTPs, Redis abuse controls, MFA/recovery replay defense, client-scoped JWT/refresh rotation, CSRF, and revocation.
- [Implement provider-agnostic SMS security](phase-04.md#implement-provider-agnostic-sms-security) — encrypted revisioned configuration, exact-revision tests, safe retries/timeouts, production fail-closed behavior, and protected development inbox.

## Phase 5 — APIs

- [Build facility discovery API core](phase-05.md#build-facility-discovery-api-core) — public text/type/nearby discovery and detail routes with strict validation, PostGIS radius ordering, filter-bound cursor pagination, and inactive-record hiding.
- [Build authentication and Super Admin SMS APIs](phase-05.md#build-authentication-and-super-admin-sms-apis) — resident/Super Admin session routes plus Super Admin-only provider configuration, revision, test, activation, and deactivation endpoints.

## Phase 6 — Business Logic

- _(no entries yet)_

## Phase 7 — Payment System (Telebirr)

- _(no entries yet)_

## Phase 8 — Performance Optimization

- _(no entries yet)_

## Phase 9 — Testing

- _(no entries yet)_

## Phase 10 — Deployment and Operations

- _(no entries yet)_

## Phase 11 — Production Readiness Gate

- _(no entries yet)_

# Learning Guide

Append-only build log for the Public Recreation Facility Management Platform backend. One file per phase of `BACKEND_BUILD_CHECKLIST.md`. An entry is appended to the matching phase file immediately after a checklist item is completed.

Each entry contains: what was done, why, how it works, key concepts, best practices, and mistakes to avoid.

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

## Phase 3 — Database Design

- _(no entries yet)_

## Phase 4 — Authentication and Security

- _(no entries yet)_

## Phase 5 — APIs

- _(no entries yet)_

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

# Phase 1 — System Architecture — Learning Guide

Append-only build log entries for Phase 1 checklist items. New entries go at the bottom.

---

## Define bounded backend modules

- **What was done:** Adopted a modular monolith with one deployable and a folder per domain (`auth`, `facilities`, `slot-booking`, `entrance-ticketing`, `payments`, `qr`, `notifications`, `staff-sync`, `admin`, `analytics`). Cross-module communication goes through TypeScript interfaces, not direct table reaches.
- **Why:** Microservices on day one would add deployment, networking, and observability cost that a solo build cannot absorb. A monolith with strict module boundaries preserves the option to extract any folder into its own service later without a rewrite.
- **How it works:** Each module owns its tables, its services, and its public interface (a typed contract). Other modules call across that interface only. The build enforces this culturally first (folder discipline), and later via lint rules or path restrictions if drift appears.
- **Key concepts:** Bounded context, modular monolith, internal service contracts, future-service extraction.
- **Best practices applied:** Pick the smallest deployable unit that fits the team, not the most fashionable architecture. Encode boundaries in folder structure so the layout itself prevents accidental coupling.
- **Mistakes to avoid:** Letting one module reach into another module's tables — once that happens, the "easy to extract later" property is silently lost. Treating the monolith as an excuse to skip module boundaries — it is the opposite, the boundaries are what make the monolith safe.

## Separate slot reservation and entrance ticket domains

- **What was done:** Slot reservations and entrance tickets live in different tables, different state machines, different APIs, and different module folders. No shared `reservations` table.
- **Why:** A tennis court booking (specific court, specific time range) and a pool ticket (date + quantity against a daily cap) share almost nothing in their lifecycles. Forcing them into one table would mean nullable columns everywhere and conditional logic on every read.
- **How it works:** `slot_reservations` holds time-range bookings against `courts`. `entrance_tickets` holds date+quantity bookings against `facility_capacities`. Payments and QR codes treat both as polymorphic payables/scannables, so the shared concerns (money, access credentials) reuse one infrastructure without forcing the domain models together.
- **Key concepts:** Domain modeling, polymorphism at the integration layer instead of the entity layer.
- **Best practices applied:** Two clear models beat one "flexible" model that has to be filtered on every query. Push polymorphism up to the things that genuinely cross domains (payments, QR), not down into the booking entity itself.
- **Mistakes to avoid:** A generic `bookings` table with `booking_type` discriminator — looks elegant on day one, becomes a tax on every query and constraint by month three.

## Design the shared payable contract

- **What was done:** Payments reference their target via `payable_type` (enum: `slot_reservation`, `entrance_ticket`, `shared_participant_payment`) + `payable_id` (UUID). Existence and ownership are validated in the service layer.
- **Why:** One payment subsystem has to cover three different bookable things without duplicating Telebirr integration, webhook handling, refund tracking, or audit logging three times.
- **How it works:** Each payment row carries the discriminator + ID pair. The payment service has a small dispatcher that, given a payable_type, knows which repository to validate the payable_id against (ownership, current state, eligibility for payment).
- **Key concepts:** Polymorphic association, service-layer integrity (vs. DB FK integrity), discriminator-based dispatch.
- **Best practices applied:** Lock the discriminator to a strict allowlist; reject unknown values at the API boundary, not in the database. Validate ownership before validating amount — the answer "you don't own this" should arrive before any payment math runs.
- **Mistakes to avoid:** Trying to model polymorphic FKs as a DB foreign key (Postgres doesn't support it). Letting clients pick `payable_type` freely without server-side validation that the user actually owns that payable — that is exactly how a client attaches a payment to someone else's reservation.

## Design the shared QR validation contract

- **What was done:** A QR token contains only the QR record's ID, signed server-side. On scan, the server looks up the record, validates state, then flips a `used` flag (single-use credentials) or decrements remaining entries (quantity-aware tickets).
- **Why:** A QR image is screenshot-able and reshare-able. The payload must reveal nothing useful to an attacker who intercepts the image, and validation must be a server-side decision, not a client-side one.
- **How it works:** Signing prevents forgery. Server-side state (used / remaining) prevents replay. Looking up the record at scan time means revocation works instantly — a refunded booking has its QR revoked in the same transaction that processes the refund.
- **Key concepts:** Signed tokens, server-authoritative validation, replay prevention, revocability.
- **Best practices applied:** Keep the payload minimum-information. Tie validation to the same transactional boundary as state changes (used flag flips in the same transaction that records the check-in).
- **Mistakes to avoid:** Stuffing booking data (facility, time, user) into the QR payload "for performance." The performance gain is tiny, the leak is permanent, and revocation becomes impossible without an extra revocation list.

## Bake offline-first staff sync into architecture

- **What was done:** Staff devices download a daily bundle scoped to (assigned facility, service date), cache it in local SQLite, validate QRs offline against that bundle, and push check-ins back in batches when connectivity returns. Idempotency key for a pushed check-in is `device_id + qr_id + scan_time_rounded_to_minute`.
- **Why:** Gate operations cannot stop because the network dropped. A staff member at a pool entrance needs to keep working through a connectivity gap and have the system reconcile correctly afterward.
- **How it works:** Pull is facility-scoped and date-scoped, so payloads stay small. The local cache contains enough info to validate a QR (signed record IDs + status snapshot). Push sends accumulated check-ins as a batch with idempotency keys, so retries are safe.
- **Key concepts:** Offline-first sync, idempotency keys, scope-restricted bulk pull, batched push with retry.
- **Best practices applied:** Scope the pull narrowly (facility + date) — a wider bundle is a bigger leak surface if a device is lost. Make idempotency keys deterministic so the same scan submitted twice is processed once.
- **Mistakes to avoid:** Letting offline validation be the final word — the server is the source of truth, and the local cache is a snapshot. Treating sync as "send everything every time" instead of incremental — that does not scale to mobile networks.

## Define staff sync conflict resolution rules

- **What was done:** Server is source of truth. First valid scan per QR wins. Subsequent duplicate or conflicting scans are logged as `rejected` sync queue entries with a reason, never silently dropped.
- **Why:** If two devices scan the same QR (legitimately, on the boundary of online/offline), one has to win. Picking "first valid wins" gives a deterministic, explainable outcome. Logging rejections keeps the audit trail complete for disputes.
- **How it works:** On push, each entry is processed against current QR state. If the QR is already `used` (or remaining-quantity exhausted), the entry is marked `conflicted` or `rejected` with a reason code, the batch carries those statuses, and the staff app can show them.
- **Key concepts:** First-writer-wins resolution, audit-complete conflict logging, deterministic outcomes.
- **Best practices applied:** Never silently discard a conflict — log it. Make the reason explicit (`duplicate_scan`, `assignment_revoked`, `qr_revoked`, etc.) so support can actually answer "why didn't my scan apply?"
- **Mistakes to avoid:** Last-write-wins on QR state — that lets a delayed offline batch overwrite an already-resolved check-in. Treating a conflict as a failure to retry — retrying it just produces the same conflict.

## Make Telebirr webhook idempotency a core design rule

- **What was done:** A dedicated `webhook_events` table with a unique constraint on the provider's event ID. Processing happens inside a transaction with a row lock on the related payment record.
- **Why:** Provider webhooks are inherently unreliable. They can arrive duplicated, out of order, or after a long delay. Without idempotency, a duplicate success callback can double-confirm or double-refund a payment.
- **How it works:** Every inbound webhook is recorded by provider event ID first (the unique constraint blocks duplicates at the database level). Then processing locks the payment row and applies the state transition only if the transition is allowed from the current state. The combination — DB-enforced dedup + state-machine guards — survives both duplication and reordering.
- **Key concepts:** Idempotency keys, optimistic state-machine guards, transactional locking around side effects.
- **Best practices applied:** Persist the raw event before processing — even if processing fails, the event is captured for replay. Lock the payment, not the webhook table, since the payment is the conflict point.
- **Mistakes to avoid:** Relying only on "if payment already paid, skip" — that misses delayed-failure callbacks. Processing the webhook before persisting it — a crash mid-processing then loses the record.

## Define entrance capacity integrity strategy

- **What was done:** Capacity is enforced by an atomic conditional update: `UPDATE facility_capacities SET sold_count = sold_count + :qty WHERE facility_id = :id AND date = :date AND sold_count + :qty <= max_capacity RETURNING id`. No row returned ⇒ sold out.
- **Why:** Two residents buying the last tickets at the same instant must not both be able to succeed. A read-then-write check has a race window; an application-level lock does not scale; `SELECT FOR UPDATE` queues writers serially.
- **How it works:** The conditional `WHERE` clause is evaluated atomically by Postgres against the current row. One purchaser sees the row updated; the other sees zero rows affected and is told sold out. No race window exists.
- **Key concepts:** Atomic conditional update, optimistic concurrency at the row level, sold-out as a query result rather than an exception.
- **Best practices applied:** Push the integrity invariant into the database, not the application. Use `RETURNING` to detect success without a separate read.
- **Mistakes to avoid:** Selecting current sold_count, deciding in code, then updating — that is the classic race condition. Using `SELECT FOR UPDATE` for every purchase — works, but unnecessarily serializes purchases on the same date.

## Define immutable audit logging as a platform primitive

- **What was done:** Dedicated `audit_logs` table. The application's DB role has INSERT only — no UPDATE or DELETE grants. Partitioned by month from the first migration.
- **Why:** A government-facing system needs an audit trail nobody — including the admin who could edit it — can quietly rewrite. Partitioning is much cheaper to bake in than to retrofit after the table has volume.
- **How it works:** A separate migration role creates and alters the table; the runtime role can only INSERT. Monthly partitions are created in advance by a job; retention/archival operates at the partition level (drop or detach an old partition).
- **Key concepts:** Append-only tables, role-based DB grants, time-based partitioning, retention via partition drop.
- **Best practices applied:** Restrict the runtime role from anything but INSERT — application bugs cannot corrupt audit history. Partition on day one — the migration to do it later under load is painful.
- **Mistakes to avoid:** Putting audit logs in the same table as the data they audit. Allowing `DELETE FROM audit_logs` from the application role "just in case." Trusting an admin UI's "no delete button" as a security control.

## Define API versioning strategy

- **What was done:** URL path versioning, `/api/v1/...`. All resources live under `/v1`.
- **Why:** Three independent clients (resident app, staff app, admin dashboard) ship on different cadences. They need a stable contract surface they can pin to.
- **How it works:** Routes are mounted under `/v1`. Breaking changes go to `/v2` and run in parallel. Clients pin to a version; deprecation is announced before removal.
- **Key concepts:** Path-based API versioning, parallel version surface, deprecation policy.
- **Best practices applied:** Pick the simplest scheme that works (URL path) rather than header-based or content-negotiation versioning. Treat the version as a contract surface, not a code-internal concept.
- **Mistakes to avoid:** Adding a "v1.1" — minor versions invite vagueness about compatibility. Skipping versioning at the start "because there is only one client" — backfilling it under three deployed clients is much more painful.

## Define consistent API error shapes

- **What was done:** Fixed error envelope: `{ "error": { "code", "message", "details", "correlationId" } }`. `code` is a stable upper-snake-case enum string, not just an HTTP status.
- **Why:** Clients need to branch on a stable identifier — wording changes, locales change, HTTP statuses are too coarse. A correlation ID lets the user's support ticket map back to a specific log line.
- **How it works:** A central error handler in NestJS maps every thrown error class to its envelope. New error codes get added to a single catalog file so the surface is auditable.
- **Key concepts:** Error envelope, stable error codes, correlation ID propagation.
- **Best practices applied:** Codes are stable strings, not HTTP statuses. Correlation IDs are generated at the request entry point and propagated through logs, errors, and outbound calls.
- **Mistakes to avoid:** Returning bare HTTP statuses for client error branching — clients end up string-matching `message`, which breaks on the next localization pass. Inventing codes ad hoc in each module — that produces synonyms and no auditable catalog.

## Design security architecture against OWASP Top 10

- **What was done:** Logged the OWASP baseline as a concrete library set: Drizzle parameterized queries, authenticated-by-default routing with explicit public allowlist, Argon2id + hashed OTPs, Zod with unknown-field rejection, Helmet + strict CORS, npm-audit/Dependabot/image scanning in CI, pino logging with redaction, outbound SSRF blocked by allowlisting Telebirr hosts, CSRF tokens on admin browser sessions.
- **Why:** OWASP Top 10 is the de-facto baseline. The question wasn't "which framework," it was "which proven libraries already wire these in." Naming them now means individual Phase 2 / Phase 4 items don't redebate the approach.
- **How it works:** Each OWASP category maps to one or more concrete checklist items in later phases. This entry is the master inventory, so individual items can just say "use the OWASP-baseline approach" instead of re-justifying.
- **Key concepts:** OWASP Top 10, defense in depth, default-deny posture.
- **Best practices applied:** Authenticated-by-default — public endpoints are exceptions explicitly marked, never accidents. Log redaction is configured at the logger, not relied on at each call site.
- **Mistakes to avoid:** Treating OWASP as a one-time review at the end. Wildcard CORS with credentials. Logging request bodies wholesale — OTPs and tokens leak immediately.

## Define rate limiting architecture by endpoint, user, and IP

- **What was done:** Redis-backed limiter. Three tiers: IP-based for public/auth endpoints, user-based for booking/payment endpoints, a dedicated stricter bucket for OTP requests.
- **Why:** OTPs and login need brute-force protection at a different intensity than facility search. A single global limit can't model that. Sharing limiter state in Redis is the only way limits work once there's more than one API instance.
- **How it works:** Each tier has its own counter key shape. Middleware picks the tier based on route metadata. Counters live in Redis with TTLs matching the window.
- **Key concepts:** Token bucket, sliding window, multi-tier limiting, shared counter store.
- **Best practices applied:** Use a proxy-aware IP extraction (don't trust raw `req.ip` behind a load balancer). Stricter buckets for OTP/login than reads.
- **Mistakes to avoid:** Process-local counters — they bypass once there are two instances. Treating bot detection as a substitute for rate limiting — it isn't.

## Define deployment architecture

- **What was done:** Containerized stateless API + worker processes, single managed Postgres, single Redis. VPS or managed provider at launch; scale out later. Separate credentials per environment (dev/staging/prod).
- **Why:** This is a pilot-stage government system. The smallest infrastructure that meets the production-grade bar lets the team iterate without operating Kubernetes. The "scale out later" clause is honest only because the horizontal-scaling and DB-scaling decisions make every component stateless and pooler-fronted from day one.
- **How it works:** API and workers are separate container images sharing the same code base. Postgres and Redis are managed services. Per-environment secrets live in the deployment platform's secret store.
- **Key concepts:** Containerization, stateless services, managed datastores, environment isolation.
- **Best practices applied:** Production never shares credentials with lower environments. Worker processes are deployable independently from API.
- **Mistakes to avoid:** "Just one Redis for everything across all envs" — a dev test that flushes the cache destroys production state. Putting workers in the same process as API "to save a container" — they then can't be scaled independently.

## Define horizontal scaling posture

- **What was done:** Logged the stateless posture: no in-process session/cache/lock state, JWT for stateless auth verification, refresh-token records in Postgres, rate-limit counters + queues + short-lived holds in Redis, workers as separate scalable processes, BullMQ repeatable jobs instead of node-cron in a single API process, no filesystem writes for state.
- **Why:** The deployment-target decision says "scale out later." That clause only holds if every component is written stateless from day one — otherwise scaling out means a rewrite.
- **How it works:** Anything that would naturally live in process memory (sessions, locks, schedules, counters) is externalized to Postgres or Redis. Adding a second API container then works without coordination.
- **Key concepts:** 12-factor app, stateless services, externalized state.
- **Best practices applied:** Cron-style work runs through the queue, not a single-node scheduler. Object storage handles uploads — no local-disk state.
- **Mistakes to avoid:** In-memory session storage. A single node-cron in an API process that triggers payment expiry — when that node dies or the cluster scales, expiries silently stop. Process-local feature-flag caches that don't invalidate across instances.

## Define database scaling path

- **What was done:** Single managed Postgres primary at launch, PgBouncer (transaction pooling) in front of it. All application connections go through the pooler. High-growth tables (`audit_logs`, `check_ins`, `webhook_events`, `notifications`, `analytics_events`, `sync_queue_entries`) are month-partitioned from the first migration. Read replicas are added only when admin analytics or facility-discovery read load measurably impacts write latency, and are never used for payment confirmation, capacity locking, QR validation, or conflict-sensitive booking writes.
- **Why:** PgBouncer keeps Postgres safe from connection exhaustion as API and worker counts grow. Month-partitioning known-hot tables avoids a painful migration later under volume. Restricting replicas from conflict-sensitive paths prevents stale-read bugs from corrupting money or capacity.
- **How it works:** PgBouncer sits between the app and Postgres, multiplexing application connections onto a small pool of real database connections. Partitioned tables are created with `PARTITION BY RANGE (created_at)` (or equivalent date column) and have monthly child partitions provisioned by a job in advance.
- **Key concepts:** Connection pooling (transaction mode), table partitioning, primary-vs-replica routing, expand-and-contract migrations.
- **Best practices applied:** Partition the tables you already know will be hot — audit logs, check-ins, webhook events, analytics events. Lock the rule that conflict-sensitive reads come from the primary into the data access layer.
- **Mistakes to avoid:** Letting workers connect directly to Postgres (bypassing the pooler) — workers are the loudest connection consumer. Reading capacity counts from a replica during purchase — stale reads here mean oversells. Trying to partition a table after it has tens of millions of rows.

## Define queue-based background processing

- **What was done:** BullMQ on Redis. Used for payment expiry, notification sends, reconciliation, sync processing, and analytics aggregation.
- **Why:** Anything not strictly required inside the request transaction belongs on a queue: notifications, expiries, reconciliation, analytics. Keeping them out of the request keeps user-facing latency stable and gives retries / dead-letter handling for free.
- **How it works:** Jobs are enqueued either inline after a successful transaction (or via the outbox pattern, defined in Phase 3) and consumed by worker processes. Each job handler must be idempotent because retries are unavoidable.
- **Key concepts:** Job queues, idempotent handlers, retry with exponential backoff, dead-letter queue.
- **Best practices applied:** Every handler is idempotent. Failed jobs go to a DLQ for inspection, not silent loss.
- **Mistakes to avoid:** Sending notifications synchronously in the request — every SMS-provider hiccup becomes a booking failure. Non-idempotent handlers — retries then duplicate side effects.

## Define observability architecture

- **What was done:** Structured JSON logging with pino, correlation IDs on every request, hosted error tracking / APM (e.g. Sentry) rather than a self-hosted metrics stack.
- **Why:** Real incident visibility matters more than dashboard prestige. A small team gets more from a managed APM than from operating Prometheus/Grafana.
- **How it works:** A middleware generates a correlation ID per request and attaches it to the logger context, the response, and any outbound calls. Errors caught by the global handler are forwarded to the APM with the correlation ID attached.
- **Key concepts:** Structured logging, correlation IDs, hosted APM, log redaction.
- **Best practices applied:** Redaction is configured at the logger level so call sites don't have to remember. Correlation IDs cross the wire (request → log → outbound call → webhook → reconciliation).
- **Mistakes to avoid:** `console.log` — unstructured, unsearchable. Operating Prometheus/Grafana without anyone owning it. Logging request bodies wholesale — OTPs, tokens, and PII leak instantly.

## Define backup and disaster recovery architecture

- **What was done:** Daily automated backups + point-in-time recovery via the managed Postgres provider, 35-day retention, encrypted at rest, quarterly restore drill.
- **Why:** A government-facing system cannot lose payment, QR, or audit data. PITR through the managed provider absorbs most operational complexity. Quarterly drills are how an RTO/RPO promise stays honest — backups that have never been restored aren't backups.
- **How it works:** The provider handles backup scheduling and storage. Restore drills happen on a separate environment with masked or synthetic data, never restoring production data into a lower environment without explicit approval.
- **Key concepts:** PITR, RTO/RPO, restore drills, encrypted-at-rest backups.
- **Best practices applied:** Restore drills on a schedule, with documented runbooks. Backups are encrypted and access-controlled separately from operational credentials.
- **Mistakes to avoid:** Never restoring — finding out backups are broken during an actual incident. Restoring prod into dev to "look at the data" — this both leaks data and bypasses access control.

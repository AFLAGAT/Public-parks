# Backend Build Checklist

Production-grade backend implementation roadmap for the Public Recreation Facility Management Platform for Addis Ababa.

This checklist assumes one backend serves three clients:

- User Mobile Application for residents
- Staff/Enforcer Mobile Application for city staff
- Admin Web Dashboard for city officials

Every checklist item includes a checkbox, priority, and one-line purpose. Extra fields are included only where they materially affect security, performance, or dependency planning.

Architecture and design decisions ("define/design" items) are resolved per AIRules.md's Decision Velocity Rule and recorded in DECISIONS.md — check there before treating any such item as open.

## Core Domain Assumptions

- Slot-based facilities include tennis, pickleball, soccer, basketball, volleyball, and any facility where a resident reserves a specific court or field for a specific time range.
- Entrance-based facilities include pools, parks, and any facility where a resident buys date-and-quantity tickets against a daily capacity cap without selecting a specific slot or court.
- Slot reservations and entrance tickets are separate domain models. Payment, QR, audit, notification, and analytics systems reference both through an explicit polymorphic contract.
- Staff mobile operation is offline-first at the data layer. The backend must support daily bulk pulls, offline validation, local check-in logs, and later batched sync with conflict resolution.
- Telebirr webhooks are not trustworthy as ordered or unique events. Every provider-triggered state transition must be idempotent and verifiable.
- Entrance ticket capacity must be protected against concurrent oversell through explicit locking or atomic capacity decrement.
- Audit logging is cross-cutting from day one across staff actions, admin actions, payment transitions, QR validation, sync events, and security events.

## Phase 1: System Architecture

- [x] **Define bounded backend modules.** **Priority:** Critical. **Purpose:** Keep auth, facilities, slot booking, entrance ticketing, payments, QR, notifications, staff sync, admin, and analytics independently evolvable even if deployed as one service first.
  - **Dependencies:** Shared domain contracts for user identity, facility identity, payable references, audit events, and notification targets.

- [x] **Separate slot reservation and entrance ticket domains.** **Priority:** Critical. **Purpose:** Prevent incompatible booking lifecycles from being forced into one reservation table.
  - **Dependencies:** Facility type taxonomy, court inventory model, daily capacity model, payment polymorphism, QR polymorphism.

- [x] **Design the shared payable contract.** **Priority:** Critical. **Purpose:** Allow payments, QR codes, receipts, refunds, and audit records to reference either slot reservations or entrance tickets without duplicating payment logic.
  - **Security considerations:** Validate `payable_type` and `payable_id` against a strict allowlist and ownership checks so clients cannot attach payments to arbitrary records.
  - **Dependencies:** Slot reservation state machine, entrance ticket state machine, payment state machine, QR issuance rules.

- [x] **Design the shared QR validation contract.** **Priority:** Critical. **Purpose:** Let one QR subsystem validate different booking types while preserving type-specific rules.
  - **Security considerations:** QR payloads must be signed or tokenized, non-guessable, revocable, scoped to booking type, and validated server-side instead of trusting embedded data.
  - **Performance considerations:** Staff validation paths must be fast for online checks and compact enough for daily offline sync payloads.
  - **Dependencies:** QR code table, check-in table, staff assignment table, offline sync contract.

- [x] **Bake offline-first staff sync into architecture.** **Priority:** Critical. **Purpose:** Support facility operations when staff devices lose connectivity without weakening validation or auditability.
  - **Security considerations:** Offline bundles must be facility-scoped, time-scoped, encrypted at rest on device, and signed or versioned so stale or tampered records can be detected during sync.
  - **Performance considerations:** Bulk pull endpoints should return only the relevant day, facility, and staff scope to avoid oversized mobile payloads.
  - **Dependencies:** Staff assignments, daily schedules, valid QR records, check-in dedupe keys, sync queue, conflict resolution policy.

- [x] **Define staff sync conflict resolution rules.** **Priority:** Critical. **Purpose:** Decide how delayed, duplicated, or out-of-order offline check-ins affect final attendance state.
  - **Security considerations:** Conflict rules must prevent a staff device from overriding check-ins outside its facility assignment or after access has been revoked.
  - **Dependencies:** Check-in idempotency keys, device identity, staff assignment history, sync batch audit logs.

- [x] **Make Telebirr webhook idempotency a core design rule.** **Priority:** Critical. **Purpose:** Ensure duplicated, delayed, or out-of-order provider callbacks cannot double-confirm, double-refund, or corrupt booking state.
  - **Security considerations:** Webhook processing must verify provider signatures or shared secrets, validate amount/currency/reference, and reject unrecognized provider transaction IDs.
  - **Dependencies:** Payment attempt table, webhook event table, idempotency key policy, payment state machine.

- [x] **Define entrance capacity integrity strategy.** **Priority:** Critical. **Purpose:** Prevent overselling pools and parks under concurrent purchases.
  - **Performance considerations:** Choose row-level locks, atomic decrement, or another database-enforced strategy that works under high contention without serializing unrelated facilities or dates.
  - **Dependencies:** FacilityCapacity table, transaction isolation choice, entrance ticket state machine, payment expiry cleanup.

- [x] **Define immutable audit logging as a platform primitive.** **Priority:** Critical. **Purpose:** Capture accountability for government-facing disputes, enforcement actions, pricing changes, and payment transitions.
  - **Security considerations:** Audit logs should be append-only to application roles, include actor identity and request metadata, and be protected from administrator-level silent edits.
  - **Performance considerations:** High-volume audit tables need partitioning or archival planning from the first schema design.
  - **Dependencies:** Actor model, correlation IDs, admin actions, staff actions, payment events, QR validation events.

- [x] **Define API versioning strategy.** **Priority:** High. **Purpose:** Allow mobile clients and the admin dashboard to evolve without breaking older deployed app versions.
  - **Dependencies:** OpenAPI documentation, deprecation policy, mobile release cadence.

- [x] **Define consistent API error shapes.** **Priority:** High. **Purpose:** Give all clients predictable validation, auth, conflict, payment, and server error handling.
  - **Dependencies:** Error code taxonomy, localization strategy, logging correlation ID.

- [x] **Design security architecture against OWASP Top 10.** **Priority:** Critical. **Purpose:** Establish the baseline controls for injection, broken auth, access control failures, misconfiguration, SSRF, XSS, CSRF, insecure design, vulnerable dependencies, and logging gaps.
  - **Security considerations:** Treat every endpoint as hostile-input boundary; require scoped authentication by default; add explicit allowlists for public endpoints.
  - **Dependencies:** Auth module, RBAC module, validation library, secrets manager, dependency scanning.

- [x] **Define rate limiting architecture by endpoint, user, and IP.** **Priority:** Critical. **Purpose:** Protect high-risk and high-volume paths such as OTP, login, search, availability, payment initiation, QR validation, and sync.
  - **Security considerations:** OTP and login limits need stricter brute-force controls than ordinary read endpoints; staff QR validation requires abuse monitoring without blocking legitimate gate operations.
  - **Performance considerations:** Rate-limit counters should live outside process memory so horizontal scaling does not bypass limits.
  - **Dependencies:** Redis or equivalent shared counter store, client identity strategy, proxy IP handling.

- [x] **Define deployment architecture.** **Priority:** High. **Purpose:** Plan stateless API instances, background workers, databases, queues, object storage, secrets, monitoring, and environment separation before implementation.
  - **Security considerations:** Dev, staging, and production must have separate credentials, databases, storage buckets, Telebirr credentials, and admin accounts.
  - **Dependencies:** Infrastructure provider, CI/CD, secrets manager, observability stack.

- [x] **Define horizontal scaling posture.** **Priority:** High. **Purpose:** Ensure API instances can scale without relying on in-memory sessions, local files, or single-node cron behavior.
  - **Performance considerations:** Session state, rate limits, queues, payment expiry jobs, and sync processing must be externalized from process memory.
  - **Dependencies:** Shared cache, queue system, worker scheduling, load balancer.

- [x] **Define database scaling path.** **Priority:** High. **Purpose:** Make read replicas, connection pooling, partitioning, and archive strategies possible without rewriting the data model.
  - **Performance considerations:** Reservations, entrance tickets, check-ins, audit logs, payment events, sync events, and analytics facts are likely high-growth tables.
  - **Dependencies:** PostgreSQL/PostGIS or equivalent, migration tooling, connection pooler, archival policy.

- [x] **Define queue-based background processing.** **Priority:** High. **Purpose:** Move payment expiry, notification sends, reconciliation, sync processing, and analytics aggregation out of request latency.
  - **Performance considerations:** Workers must support retries, dead-letter queues, idempotent handlers, and backpressure.
  - **Dependencies:** Queue broker, job schema, worker deployment, observability.

- [x] **Define observability architecture.** **Priority:** Critical. **Purpose:** Detect incidents on payments, QR validation, capacity locking, offline sync, authentication, and admin actions before they become public failures.
  - **Security considerations:** Logs must not leak OTPs, access tokens, QR secrets, payment secrets, or personal data beyond approved fields.
  - **Performance considerations:** Logging and tracing must be structured and sampled responsibly under load.
  - **Dependencies:** Correlation IDs, centralized logging, metrics, tracing, alerting.

- [x] **Define backup and disaster recovery architecture.** **Priority:** Critical. **Purpose:** Commit to restore-tested backups, retention, RPO, and RTO for a government-facing system.
  - **Security considerations:** Backups must be encrypted, access-controlled, and separated from ordinary application credentials.
  - **Dependencies:** Database backup tooling, object storage backup, restore environment, incident runbooks.

- [ ] **Define privacy and data retention principles.** **Priority:** High. **Purpose:** Minimize unnecessary personal data while keeping legally and operationally required records for disputes and audits.
  - **Security considerations:** Establish who can view resident data, payment metadata, staff activity, device sync history, and audit logs.
  - **Dependencies:** Legal retention requirements, admin permission model, reporting needs. **See DECISIONS.md — retention period needs confirmation against Ethiopian recordkeeping requirements before finalizing.**

## Phase 2: Backend Foundation

- [x] **Initialize production-oriented project structure.** **Priority:** High. **Purpose:** Create module boundaries that mirror the architecture instead of a flat prototype layout.
  - **Dependencies:** Chosen backend framework, module naming conventions, test layout.

- [x] **Create configuration management layer.** **Priority:** Critical. **Purpose:** Centralize typed runtime configuration for database, cache, queues, Telebirr, auth, storage, and observability.
  - **Security considerations:** Reject startup when required secrets are missing, malformed, or accidentally using development defaults in staging or production.

- [ ] **Set up secrets management.** **Priority:** Critical. **Purpose:** Keep credentials out of source code, committed env files, Docker images, and logs.
  - **Security considerations:** Use a secrets manager or platform secret store; rotate Telebirr keys, JWT signing keys, database passwords, and object storage credentials.
  - **Dependencies:** Deployment platform, CI/CD secret injection, access control policy.

- [ ] **Create fully separated environments.** **Priority:** Critical. **Purpose:** Ensure dev, staging, and production cannot share credentials, databases, object storage, queues, Telebirr credentials, or admin sessions.
  - **Security considerations:** Production data must not be copied into lower environments without masking and explicit approval.
  - **Dependencies:** Infrastructure accounts/projects, secrets manager, database provisioning.

- [ ] **Provision PostgreSQL with geospatial support.** **Priority:** Critical. **Purpose:** Support transactional integrity and efficient geolocation facility search.
  - **Performance considerations:** Use PostGIS or equivalent spatial indexing instead of naive latitude/longitude filtering.
  - **Dependencies:** Database hosting, migration tooling, geospatial extension support.

- [ ] **Set up ORM or query builder with migration discipline.** **Priority:** High. **Purpose:** Keep schema evolution reviewable, repeatable, and safe across environments.
  - **Security considerations:** Parameterized queries must be the default path to prevent SQL injection.
  - **Dependencies:** Migration framework, rollback policy, schema review process.

- [ ] **Create API documentation pipeline.** **Priority:** High. **Purpose:** Maintain OpenAPI or equivalent contracts for mobile, staff, and admin teams.
  - **Dependencies:** Request/response schema definitions, contract testing plan.

- [ ] **Set up testing framework and test database workflow.** **Priority:** High. **Purpose:** Make unit, integration, API, concurrency, security, and payment-flow tests easy to run consistently.
  - **Dependencies:** Test runner, isolated database, factory fixtures, CI.

- [ ] **Create standard request validation layer.** **Priority:** Critical. **Purpose:** Validate and normalize all external input at the API boundary.
  - **Security considerations:** Reject unexpected fields, invalid enum values, malformed IDs, unsafe strings, impossible dates, invalid quantities, and cross-tenant identifiers before business logic.

- [ ] **Create standard response and pagination helpers.** **Priority:** High. **Purpose:** Enforce consistent list shapes, page sizes, cursors, and metadata across APIs.
  - **Performance considerations:** Default page sizes must prevent unbounded scans and oversized payloads.

- [ ] **Create structured logging foundation.** **Priority:** Critical. **Purpose:** Emit searchable logs with correlation IDs, actor IDs, endpoint names, payment IDs, QR IDs, and sync batch IDs where relevant.
  - **Security considerations:** Redact tokens, OTPs, QR secrets, payment secrets, and personal data not required for operations.

- [ ] **Create centralized error handling.** **Priority:** High. **Purpose:** Map validation, auth, permission, conflict, payment, and infrastructure failures to stable client-facing errors.
  - **Dependencies:** Error code catalog, logging middleware.

- [ ] **Set up authentication middleware skeleton.** **Priority:** Critical. **Purpose:** Make authenticated-by-default routing possible from the first endpoint.
  - **Security considerations:** Public endpoints must be explicitly marked public, not accidentally left unauthenticated.

- [ ] **Set up RBAC and permission primitives.** **Priority:** Critical. **Purpose:** Support resident, staff, supervisor, admin, finance, auditor, and system roles with scoped permissions.
  - **Security considerations:** Permission checks must run server-side and include facility scope where applicable.
  - **Dependencies:** Roles, permissions, staff assignments, admin policy.

- [ ] **Set up shared rate limiter infrastructure.** **Priority:** Critical. **Purpose:** Provide reusable endpoint, user, IP, and OTP-specific throttling from the start.
  - **Security considerations:** Avoid trusting raw client IP without proxy-aware configuration.
  - **Performance considerations:** Use a shared store so limits work across API instances.

- [ ] **Set up background job framework.** **Priority:** High. **Purpose:** Support payment expiry, notifications, reconciliation, analytics aggregation, sync processing, and cleanup.
  - **Performance considerations:** Jobs must be retryable, idempotent, observable, and safe under multiple workers.

- [ ] **Set up health check endpoints.** **Priority:** High. **Purpose:** Allow deployment systems and operators to distinguish alive, ready, and dependency-degraded states.
  - **Dependencies:** Database, cache, queue, object storage, Telebirr reachability checks.

- [ ] **Set up secure file storage abstraction.** **Priority:** Medium. **Purpose:** Support facility images and future uploads without binding business logic to local disk.
  - **Security considerations:** Enforce file type allowlists, size limits, malware scanning where available, private buckets by default, and signed public access where needed.

- [ ] **Create seed data strategy for reference records.** **Priority:** Medium. **Purpose:** Manage facility types, roles, permissions, schedules, and admin bootstrap records predictably.
  - **Security considerations:** Production bootstrap credentials must be one-time or forced to rotate on first use.

## Phase 3: Database Design

- [ ] **Model users with client-neutral identity.** **Priority:** Critical. **Purpose:** Represent residents, staff, and admins without duplicating identity records across clients.
  - **Security considerations:** Store only hashed passwords or OTP verification state; never store OTPs or reset tokens in plaintext.

- [ ] **Model roles and permissions explicitly.** **Priority:** Critical. **Purpose:** Support strict admin, staff, finance, auditor, and resident access boundaries.
  - **Security considerations:** Permission assignments need audit logs and should avoid broad super-admin use for routine operations.

- [ ] **Model staff assignments by facility and time range.** **Priority:** Critical. **Purpose:** Enforce server-side facility scope for staff actions and offline sync.
  - **Security considerations:** Check assignment validity for each schedule view, QR validation, and sync pull or push.
  - **Dependencies:** Users, facilities, roles, audit logs.

- [ ] **Model facilities with operational classification.** **Priority:** Critical. **Purpose:** Distinguish slot-based and entrance-based facilities at the schema level.
  - **Dependencies:** Facility type records, geospatial location, pricing, schedules, capacity settings.

- [ ] **Model courts and fields as child resources.** **Priority:** High. **Purpose:** Track reservable physical assets for slot-based facilities.
  - **Dependencies:** Facilities, maintenance closures, schedules, slot reservations.

- [ ] **Model facility schedules and exceptions.** **Priority:** High. **Purpose:** Support normal operating hours, holidays, closures, maintenance, seasonal schedules, and court-specific unavailability.
  - **Dependencies:** Facilities, courts, admin audit logs, availability engine.

- [ ] **Model slot reservations separately from entrance tickets.** **Priority:** Critical. **Purpose:** Preserve time-bound court booking rules independently from date-and-quantity ticket rules.
  - **Performance considerations:** Index by facility, court, start time, end time, status, and user for availability and resident reservation lists.
  - **Dependencies:** Courts, users, payments, QR codes, check-ins.

- [ ] **Model slot holds.** **Priority:** Critical. **Purpose:** Temporarily reserve a selected slot during payment without permanently blocking inventory.
  - **Performance considerations:** Expiry cleanup must be job-driven and indexed by expiration time and status.
  - **Dependencies:** Reservation state machine, payment initiation, queue jobs.

- [ ] **Model shared reservation groups.** **Priority:** Critical. **Purpose:** Support group creation, participant management, per-participant payment links, deadlines, cancellation, and refunds.
  - **Security considerations:** Participant invite tokens must be non-guessable, scoped to the group, and revocable.
  - **Dependencies:** Slot reservations, participants, payment attempts, notification jobs.

- [ ] **Model shared reservation participants.** **Priority:** High. **Purpose:** Track participant identity, payment status, invite state, and refund eligibility.
  - **Dependencies:** Shared reservation groups, users, payments, notifications.

- [ ] **Model entrance tickets separately.** **Priority:** Critical. **Purpose:** Represent date, facility, quantity, status, buyer, QR issuance, and capacity consumption for pools and parks.
  - **Performance considerations:** Index by facility, visit date, status, buyer, and payment state for capacity checks and staff daily sync.
  - **Dependencies:** FacilityCapacity, payments, QR codes, check-ins.

- [ ] **Model daily facility capacity.** **Priority:** Critical. **Purpose:** Track available and sold entrance capacity per facility and date.
  - **Performance considerations:** Use unique constraints on facility/date and atomic updates or row-level locks for high-concurrency purchase paths.
  - **Dependencies:** Entrance tickets, schedules, admin capacity changes.

- [ ] **Model payments as polymorphic records.** **Priority:** Critical. **Purpose:** Let one payment system handle slot reservations, shared reservation participant payments, and entrance tickets.
  - **Security considerations:** Store provider references and amounts immutably enough for reconciliation; prevent clients from changing amount, payable type, or payable ID after initiation.
  - **Dependencies:** Payable contract, payment attempts, Telebirr provider records.

- [ ] **Model payment attempts separately from payment aggregate state.** **Priority:** Critical. **Purpose:** Preserve retry history, provider references, callbacks, and failure reasons without overwriting important payment evidence.
  - **Dependencies:** Payments, webhook events, reconciliation jobs.

- [ ] **Model Telebirr webhook events.** **Priority:** Critical. **Purpose:** Persist every provider callback for idempotency, ordering analysis, reconciliation, and dispute investigation.
  - **Security considerations:** Store verification result, provider event ID, normalized idempotency key, and raw payload with sensitive fields redacted or encrypted.
  - **Dependencies:** Payment attempts, audit logs, provider signature verification.

- [ ] **Model QR codes as polymorphic access credentials.** **Priority:** Critical. **Purpose:** Issue one QR pattern that can reference either a slot reservation or an entrance ticket.
  - **Security considerations:** Store hashed QR secrets or token identifiers, not raw reusable secrets when avoidable.
  - **Dependencies:** Payments, reservations, entrance tickets, check-ins, offline sync bundles.

- [ ] **Model check-ins with idempotency keys.** **Priority:** Critical. **Purpose:** Prevent duplicate scans or offline replay from creating multiple attendance records.
  - **Security considerations:** Include staff actor, device ID, facility scope, validation source, and sync batch reference.
  - **Dependencies:** QR codes, staff assignments, sync queue, audit logs.

- [ ] **Model sync batches and sync queue records.** **Priority:** Critical. **Purpose:** Track offline pull versions, pushed check-ins, device deltas, conflicts, and processing results.
  - **Security considerations:** Sync records must be scoped to assigned facilities and reject stale or unauthorized device submissions.
  - **Performance considerations:** Index by staff, facility, service date, device, batch status, and submitted time for operational troubleshooting.
  - **Dependencies:** Staff assignments, check-ins, audit logs, QR codes.

- [ ] **Model notifications.** **Priority:** High. **Purpose:** Track queued, sent, failed, and user-visible notifications for bookings, payments, deadlines, refunds, and staff/admin events.
  - **Dependencies:** Users, reservations, tickets, payments, background workers.

- [ ] **Model immutable audit logs.** **Priority:** Critical. **Purpose:** Record staff scans, admin changes, payment transitions, sync events, permission changes, and security-sensitive actions.
  - **Security considerations:** Audit records must include actor, action, target, before/after summary where appropriate, request metadata, and correlation ID.
  - **Performance considerations:** Partition or archive by time because audit volume can grow quickly.

- [ ] **Model analytics source facts.** **Priority:** High. **Purpose:** Ensure revenue, usage, attendance, peak time, cancellation, refund, and trend analytics are based on captured backend events.
  - **Performance considerations:** Separate operational writes from analytics aggregation with background jobs or materialized views.
  - **Dependencies:** Payments, reservations, entrance tickets, check-ins, facilities, audit logs.

- [ ] **Define reservation conflict constraints.** **Priority:** Critical. **Purpose:** Enforce that a court cannot have overlapping confirmed or held reservations.
  - **Performance considerations:** Use database constraints, exclusion constraints, or locked availability calculations rather than application-only checks.
  - **Dependencies:** Slot reservations, slot holds, transaction isolation.

- [ ] **Define entrance capacity constraints.** **Priority:** Critical. **Purpose:** Enforce that sold entrance quantity never exceeds the daily cap.
  - **Performance considerations:** Capacity consumption should be guarded by database-enforced atomicity under concurrent transactions.
  - **Dependencies:** FacilityCapacity, entrance ticket writes, payment state transitions.

- [ ] **Define data snapshot fields for prices and facility names.** **Priority:** High. **Purpose:** Preserve historical receipts and analytics even when admins later change pricing or facility metadata.
  - **Dependencies:** Pricing model, payments, reservations, entrance tickets.

- [ ] **Define soft-delete and archival policy.** **Priority:** High. **Purpose:** Protect historical records while allowing operational deactivation of users, staff, courts, facilities, and pricing.
  - **Security considerations:** Deactivated users and staff must lose active access immediately even if historical records remain.

- [ ] **Define indexing strategy from query patterns.** **Priority:** Critical. **Purpose:** Tie indexes to actual high-volume reads such as slot availability, geolocation search, staff daily schedule, QR validation, resident reservation lists, and admin analytics.
  - **Performance considerations:** Avoid generic over-indexing; evaluate composite indexes against known filters and sort order.

- [ ] **Define transaction boundaries for multi-step writes.** **Priority:** Critical. **Purpose:** Ensure booking creation, payment state changes, capacity consumption, QR issuance, notifications, and audit events remain consistent.
  - **Dependencies:** Payment state machine, reservation state machine, outbox pattern, queue jobs.

- [ ] **Define outbox pattern for side effects.** **Priority:** High. **Purpose:** Reliably send notifications, analytics events, and downstream jobs after database commits.
  - **Performance considerations:** Outbox processing must be idempotent and scalable across workers.
  - **Dependencies:** Background queue, transaction handling, notification service.

## Phase 4: Authentication and Security

- [ ] **Implement resident registration and login policy.** **Priority:** Critical. **Purpose:** Define how residents securely create accounts, verify identity channels, and recover access.
  - **Security considerations:** Rate-limit registration, normalize phone/email identifiers, prevent enumeration, and audit suspicious signup patterns.

- [ ] **Implement staff and admin account provisioning policy.** **Priority:** Critical. **Purpose:** Ensure privileged accounts are created, assigned, suspended, and removed through auditable administrative workflows.
  - **Security considerations:** Staff and admin accounts should not self-register into privileged roles; all role grants require audit logs.

- [ ] **Secure OTP handling.** **Priority:** Critical. **Purpose:** Prevent OTP brute force, replay, leakage, and long-lived verification risk.
  - **Security considerations:** Hash OTPs, set short expiry, limit attempts per user and IP, delay repeated requests, invalidate used OTPs, and avoid logging OTP values.
  - **Dependencies:** Shared rate limiter, identity table, notification/SMS provider.

- [ ] **Secure password handling where passwords are used.** **Priority:** Critical. **Purpose:** Store credentials safely and support forced reset or rotation for compromised accounts.
  - **Security considerations:** Use a modern password hashing algorithm with tuned cost, never store plaintext, and audit password reset events.

- [ ] **Require MFA for administrators.** **Priority:** Critical. **Purpose:** Reduce account takeover risk for high-privilege dashboard users.
  - **Security considerations:** Backup codes and MFA reset flows need strict auditability and approval boundaries.

- [ ] **Design access and refresh token lifecycle.** **Priority:** Critical. **Purpose:** Balance mobile usability with revocation, rotation, and client-specific security requirements.
  - **Security considerations:** Use short-lived access tokens, refresh token rotation, device/session tracking, revocation on logout or staff deactivation, and separate token scopes per client type.

- [ ] **Implement scoped authorization middleware.** **Priority:** Critical. **Purpose:** Enforce permissions centrally before controllers reach business logic.
  - **Security considerations:** Check actor role, client type, facility scope, ownership, and action-specific permission for every protected endpoint.

- [ ] **Enforce staff facility scope server-side.** **Priority:** Critical. **Purpose:** Prevent staff from viewing schedules, validating QR codes, or syncing records outside assigned facilities.
  - **Security considerations:** Hidden UI controls are insufficient; every staff endpoint must verify active assignment and service date.

- [ ] **Enforce admin permission boundaries.** **Priority:** Critical. **Purpose:** Separate facility operations, pricing, finance, staff management, user support, analytics, and audit access.
  - **Security considerations:** Sensitive actions such as role grants, refund approvals, price changes, and audit exports should require elevated permissions and audit events.

- [ ] **Protect against SQL injection.** **Priority:** Critical. **Purpose:** Ensure all database access uses parameterized queries and safe query builders.
  - **Security considerations:** Raw SQL must be reviewed, parameterized, and tested with malicious inputs.

- [ ] **Protect against XSS in API-fed content.** **Priority:** High. **Purpose:** Prevent stored unsafe content from affecting admin dashboards or mobile clients.
  - **Security considerations:** Validate and sanitize facility descriptions, names, notices, image metadata, and admin-entered content at input and render boundaries.

- [ ] **Protect CSRF-relevant admin flows.** **Priority:** Critical. **Purpose:** Prevent browser-based admin sessions from being abused through cross-site requests.
  - **Security considerations:** Use same-site cookies, CSRF tokens where applicable, origin checks, and avoid unsafe state changes through GET requests.

- [ ] **Implement CORS policy.** **Priority:** High. **Purpose:** Restrict browser access to approved admin dashboard origins and deployment environments.
  - **Security considerations:** Avoid wildcard origins with credentials and separate dev/staging/prod origins.

- [ ] **Implement per-endpoint rate limits.** **Priority:** Critical. **Purpose:** Apply tighter controls to expensive or sensitive endpoints while preserving normal usage.
  - **Performance considerations:** Search and availability endpoints need limits that protect database load without blocking ordinary discovery.

- [ ] **Implement per-user rate limits.** **Priority:** Critical. **Purpose:** Stop authenticated abuse such as slot-locking, fake shared reservations, payment spam, and QR validation flooding.
  - **Security considerations:** Combine with abuse detection for repeated reservations that expire unpaid.

- [ ] **Implement per-IP rate limits.** **Priority:** Critical. **Purpose:** Reduce unauthenticated attacks, credential stuffing, OTP abuse, and scraping.
  - **Security considerations:** Proxy-aware IP extraction and allowlisted internal services must be configured carefully.

- [ ] **Implement secure file upload controls.** **Priority:** High. **Purpose:** Safely support facility images and future document uploads.
  - **Security considerations:** Enforce size limits, MIME sniffing, file extension allowlists, private storage, virus scanning where available, and signed URLs.

- [ ] **Implement API authentication on every endpoint.** **Priority:** Critical. **Purpose:** Make unauthenticated access an explicit exception rather than an accidental default.
  - **Security considerations:** Public facility discovery may expose only approved public fields; internal capacity, revenue, staff, and audit data must require scoped auth.

- [ ] **Implement security event logging.** **Priority:** Critical. **Purpose:** Record login failures, OTP abuse, token revocations, permission denials, admin changes, and suspicious payment or QR behavior.
  - **Security considerations:** Logs must be useful for incident response without leaking secrets.

- [ ] **Implement dependency and vulnerability scanning.** **Priority:** High. **Purpose:** Detect known vulnerable packages and container issues before deployment.
  - **Dependencies:** CI pipeline, package manager, container registry.

## Phase 5: APIs

- [ ] **Define API version and compatibility rules.** **Priority:** High. **Purpose:** Keep mobile, staff, and admin clients stable across backend evolution.
  - **Dependencies:** OpenAPI documentation, release process, deprecation policy.

- [ ] **Build authentication APIs.** **Priority:** Critical. **Purpose:** Support registration, login, OTP verification, refresh, logout, session revocation, profile bootstrap, and account recovery.
  - **Security considerations:** Prevent account enumeration, brute force, token replay, and weak reset flows.

- [ ] **Build resident profile APIs.** **Priority:** High. **Purpose:** Let residents manage personal details, notification preferences, active sessions, and account status.
  - **Security considerations:** Users must only access or change their own profile unless an admin endpoint with explicit permission is used.

- [ ] **Build facility discovery APIs.** **Priority:** Critical. **Purpose:** Support GPS-based nearby search, text search, filtering by facility type, amenities, availability hints, and public facility details.
  - **Performance considerations:** Use geospatial indexes, bounded result sets, pagination, and cache public facility metadata separately from live availability.

- [ ] **Build slot availability APIs.** **Priority:** Critical. **Purpose:** Let residents query available courts and time ranges accurately before booking.
  - **Performance considerations:** Optimize for repeated reads by facility/date/sport while avoiding stale confirmed or held slot data.
  - **Dependencies:** Facilities, courts, schedules, closures, reservations, holds.

- [ ] **Build slot reservation APIs.** **Priority:** Critical. **Purpose:** Support availability selection, hold creation, reservation confirmation, cancellation, and resident booking history.
  - **Security considerations:** Enforce ownership, booking limits, abuse controls, and server-generated prices.
  - **Performance considerations:** Conflict checks must be transaction-safe under concurrent booking attempts.

- [ ] **Build shared reservation APIs.** **Priority:** Critical. **Purpose:** Support group creation, participant invites, participant payment links, payment deadline timers, cancellation, and partial refund flows.
  - **Security considerations:** Invite tokens and participant links must be scoped, expiring, non-guessable, and protected against slot-locking abuse.
  - **Dependencies:** Shared reservation groups, participants, notifications, payments, refund policy.

- [ ] **Build entrance ticket APIs.** **Priority:** Critical. **Purpose:** Support date and quantity selection, fee preview, capacity hold or purchase, payment, QR issuance, and ticket history.
  - **Performance considerations:** Purchase endpoints must protect daily capacity with locking or atomic decrement.
  - **Dependencies:** FacilityCapacity, pricing snapshots, payments, QR codes.

- [ ] **Build polymorphic payment APIs.** **Priority:** Critical. **Purpose:** Initiate, inspect, expire, and recover payments for slot reservations, shared participants, and entrance tickets through one contract.
  - **Security considerations:** Clients must not control trusted amount, payable ownership, currency, or provider reference values.
  - **Dependencies:** Payments, payment attempts, Telebirr integration.

- [ ] **Build QR issuance APIs.** **Priority:** Critical. **Purpose:** Issue resident-visible QR credentials only after valid payment and booking confirmation.
  - **Security considerations:** QR issuance must be server-side, tied to confirmed state, revocable, and auditable.
  - **Dependencies:** Payments, reservations, entrance tickets, QR codes.

- [ ] **Build resident reservation and ticket list APIs.** **Priority:** High. **Purpose:** Let residents view upcoming, past, canceled, refunded, and shared bookings across booking types.
  - **Performance considerations:** Paginate and index by user, status, visit date, and start time.

- [ ] **Build notification APIs.** **Priority:** Medium. **Purpose:** Let clients retrieve booking, payment, deadline, refund, and facility update notifications.
  - **Performance considerations:** Paginate notifications and avoid loading all historical messages by default.

- [ ] **Build staff login and session APIs.** **Priority:** Critical. **Purpose:** Authenticate staff devices and bootstrap assigned facilities, permissions, and sync configuration.
  - **Security considerations:** Device/session tracking and revocation are required because staff devices may be shared or lost.

- [ ] **Build staff daily schedule APIs.** **Priority:** Critical. **Purpose:** Show staff the day schedule for assigned facilities only.
  - **Performance considerations:** Optimize by facility/date/status because this is a common staff workflow.
  - **Dependencies:** Staff assignments, slot reservations, entrance tickets, check-ins.

- [ ] **Build online QR validation APIs.** **Priority:** Critical. **Purpose:** Validate slot reservations and entrance tickets in real time with type-specific rules.
  - **Security considerations:** Enforce facility scope, QR signature/token validity, booking status, date/time rules, duplicate check-in rules, and audit logging.
  - **Performance considerations:** Keep validation latency low and indexes targeted by QR token ID, status, facility, and date.

- [ ] **Build staff offline sync pull APIs.** **Priority:** Critical. **Purpose:** Let assigned staff download the day's valid reservations, tickets, QR validation metadata, and schedule state for offline work.
  - **Security considerations:** Payloads must be facility-scoped, date-scoped, authenticated, and revocation-aware.
  - **Performance considerations:** Support incremental sync versions and compression for mobile networks.
  - **Dependencies:** Staff assignments, QR codes, check-ins, sync batches.

- [ ] **Build staff offline sync push APIs.** **Priority:** Critical. **Purpose:** Accept batched offline check-ins and sync deltas when connectivity returns.
  - **Security considerations:** Verify device/session, staff assignment at event time, idempotency keys, and conflict policy before accepting records.
  - **Performance considerations:** Batch processing should avoid one database transaction per scan while preserving atomicity per batch or per record.
  - **Dependencies:** Sync queue, check-ins, audit logs, conflict resolution rules.

- [ ] **Build admin facility management APIs.** **Priority:** Critical. **Purpose:** Support CRUD, facility type, location, images, operating hours, closures, amenities, courts, pricing, and capacity caps.
  - **Security considerations:** Price, capacity, closure, and facility status changes require permission checks and audit logging.

- [ ] **Build admin user management APIs.** **Priority:** High. **Purpose:** Let authorized officials review, suspend, restore, or support resident accounts.
  - **Security considerations:** Support actions must not expose OTPs, passwords, QR secrets, or unnecessary payment details.

- [ ] **Build admin staff management APIs.** **Priority:** Critical. **Purpose:** Manage staff accounts, roles, facility assignments, device revocation, and assignment history.
  - **Security considerations:** Staff assignment changes must invalidate future unauthorized sync and QR validation access.

- [ ] **Build admin role and permission APIs.** **Priority:** Critical. **Purpose:** Manage government dashboard access without broad, permanent super-admin use.
  - **Security considerations:** Role changes must require elevated permission, audit logging, and possibly dual approval for high-risk roles.

- [ ] **Build admin analytics APIs.** **Priority:** High. **Purpose:** Report revenue, usage, attendance, peak times, trends, cancellations, refunds, and facility performance from captured backend data.
  - **Performance considerations:** Serve analytics from aggregates, materialized views, or read replicas rather than expensive live transactional queries.

- [ ] **Build audit log search APIs.** **Priority:** Critical. **Purpose:** Let authorized auditors investigate staff actions, admin changes, QR scans, sync batches, and payment transitions.
  - **Security considerations:** Audit access is highly privileged and must itself be audited.
  - **Performance considerations:** Use date, actor, action, target type, target ID, and facility indexes.

- [ ] **Build export APIs for authorized reporting.** **Priority:** Medium. **Purpose:** Support official reporting workflows without direct database access.
  - **Security considerations:** Exports must enforce permissions, redact sensitive fields, and log who exported what.
  - **Performance considerations:** Large exports should run as background jobs with expiring download links.

## Phase 6: Business Logic

- [ ] **Implement payment provider abstraction with a mock/sandbox adapter.** **Priority:** Critical. **Purpose:** Let every payment-dependent item below (state machine, atomicity, QR issuance, capacity consumption) be built and tested without waiting on Telebirr merchant account approval. **See DECISIONS.md — mock-first, real Telebirr adapter swaps in behind the same interface in Phase 7.**
  - **Dependencies:** Payable contract, payment state machine design.

- [ ] **Define slot reservation state machine.** **Priority:** Critical. **Purpose:** Make hold, pending payment, confirmed, checked in, canceled, expired, refunded, and dispute states explicit.
  - **Dependencies:** Payments, QR codes, notifications, audit logs.

- [ ] **Define entrance ticket state machine.** **Priority:** Critical. **Purpose:** Make pending payment, confirmed, partially used, fully used, canceled, expired, refunded, and dispute states explicit.
  - **Dependencies:** FacilityCapacity, payments, QR codes, check-ins.

- [ ] **Implement slot conflict prevention.** **Priority:** Critical. **Purpose:** Prevent two residents or groups from reserving the same court and time.
  - **Performance considerations:** Use database locks or constraints inside the reservation transaction, not an application-only pre-check.
  - **Dependencies:** Slot reservations, slot holds, transaction isolation.

- [ ] **Implement slot hold expiration.** **Priority:** Critical. **Purpose:** Release unpaid slot holds automatically and fairly.
  - **Performance considerations:** Expiry jobs should scan indexed pending records and avoid locking large unrelated ranges.
  - **Dependencies:** Background jobs, reservation state machine, payment state.

- [ ] **Implement shared reservation deadline logic.** **Priority:** Critical. **Purpose:** Cancel or adjust group bookings when participants do not pay before the deadline.
  - **Security considerations:** Prevent a user from repeatedly locking popular slots with unpaid groups.
  - **Dependencies:** Participant state, payments, notifications, abuse rules.

- [ ] **Implement participant payment ownership rules.** **Priority:** Critical. **Purpose:** Ensure each group participant can pay only their own assigned share or accepted role.
  - **Security considerations:** Payment links must not allow changing participant, amount, reservation, or deadline.

- [ ] **Implement partial refund rules.** **Priority:** High. **Purpose:** Handle shared booking cancellations, participant withdrawal, facility closure, and payment failures consistently.
  - **Dependencies:** Refund policy, payment provider capabilities, audit logs. **See DECISIONS.md — depends on Telebirr refund verification in Phase 7.**

- [ ] **Implement anti-abuse booking controls.** **Priority:** Critical. **Purpose:** Reduce fake reservations, slot-locking, payment spam, and repeated unpaid holds.
  - **Security considerations:** Track unpaid expiration rates, per-user hold limits, per-facility limits, device/session patterns, and suspicious group invite behavior.

- [ ] **Implement entrance capacity locking.** **Priority:** Critical. **Purpose:** Ensure concurrent ticket purchases cannot exceed daily facility capacity.
  - **Performance considerations:** Use row-level locks, atomic decrement, or equivalent database-enforced capacity updates within the purchase transaction. **See DECISIONS.md — atomic conditional update chosen.**
  - **Dependencies:** FacilityCapacity, entrance tickets, payment state, transaction isolation.

- [ ] **Implement entrance ticket quantity rules.** **Priority:** High. **Purpose:** Enforce min/max quantities, age or category pricing, date restrictions, and sold-out handling.
  - **Dependencies:** Pricing rules, capacity rules, facility schedules.

- [ ] **Implement server-side price calculation.** **Priority:** Critical. **Purpose:** Prevent clients from tampering with price, discount, fee, or quantity values.
  - **Security considerations:** Persist price snapshots and verify payment amount against server-calculated totals before confirmation.

- [ ] **Implement QR issuance rules.** **Priority:** Critical. **Purpose:** Issue QR credentials only after payment and booking state are safely confirmed.
  - **Security considerations:** QR generation must happen inside or immediately after the same committed state transition that confirms access rights.
  - **Dependencies:** Payments, reservations, tickets, transaction boundaries.

- [ ] **Implement slot QR validation rules.** **Priority:** Critical. **Purpose:** Validate facility, court, date, time window, status, staff assignment, and duplicate scan behavior for slot reservations.
  - **Security considerations:** Reject scans outside facility scope, outside allowed time windows, canceled/refunded bookings, and previously consumed one-time credentials.

- [ ] **Implement entrance QR validation rules.** **Priority:** Critical. **Purpose:** Validate facility, visit date, ticket quantity, remaining entries, status, staff assignment, and duplicate scan behavior for entrance tickets.
  - **Security considerations:** Support quantity-aware check-ins without allowing replay beyond purchased quantity.

- [ ] **Implement check-in idempotency.** **Priority:** Critical. **Purpose:** Make repeated online or offline scan submissions safe.
  - **Security considerations:** Idempotency keys must include QR, facility, staff/device, and logical scan event identity.
  - **Dependencies:** Check-ins, sync batches, QR codes.

- [ ] **Implement offline sync conflict handling.** **Priority:** Critical. **Purpose:** Resolve late, duplicate, stale, or unauthorized offline check-ins deterministically.
  - **Security considerations:** Conflict outcomes should be audit logged and never silently grant access outside assignment scope.
  - **Dependencies:** Sync queue, check-ins, staff assignment history, QR status snapshots.

- [ ] **Implement facility closure handling.** **Priority:** High. **Purpose:** Cancel or reschedule affected slot reservations and entrance tickets when facilities close unexpectedly.
  - **Dependencies:** Admin schedule changes, notification jobs, refund policy.

- [ ] **Implement pricing change handling.** **Priority:** High. **Purpose:** Apply new prices to future purchases without corrupting historical receipts or active payments.
  - **Dependencies:** Pricing snapshots, payment initiation, audit logs.

- [ ] **Implement notification business rules.** **Priority:** High. **Purpose:** Send resident and staff notifications for confirmations, deadlines, cancellations, refunds, facility closures, and sync issues.
  - **Performance considerations:** Notification sends should run through background jobs and not block booking or payment responses.

- [ ] **Implement timezone and calendar rules.** **Priority:** High. **Purpose:** Keep date, schedule, expiry, and visit-day behavior correct for Addis Ababa operations.
  - **Dependencies:** Facility schedules, ticket visit dates, payment deadlines, staff daily sync.

- [ ] **Implement payment-confirmation atomicity.** **Priority:** Critical. **Purpose:** Ensure payment confirmation, booking state change, capacity consumption, QR issuance, audit logging, and outbox events cannot partially succeed.
  - **Performance considerations:** Keep the critical transaction narrow while deferring non-critical side effects through outbox jobs.
  - **Dependencies:** Payments, reservations, tickets, QR codes, audit logs, outbox.

## Phase 7: Payment System - Telebirr

This phase builds the real Telebirr adapter behind the `PaymentProvider` interface already in use since Phase 6 — it replaces the mock, it doesn't introduce payment handling from scratch. Everything upstream (state machine, atomicity, QR issuance) was already built and tested against the interface.

- [ ] **Verify Telebirr refund mechanics with actual merchant documentation.** **Priority:** Critical. **Purpose:** Confirm whether programmatic refunds are supported before any refund item below is treated as standard backend implementation work.
  - **Security considerations:** Do not assume refund API behavior from third-party SDK wrappers; confirm directly against Ethio Telecom merchant documentation obtained during onboarding.
  - **Dependencies:** Telebirr merchant account approval, official integration documentation. See DECISIONS.md — unresolved as of this writing.
  - **Note:** If refunds are not supported programmatically, or are restricted by amount/time-window/manual-approval, the refund and partial-refund items below change from "build an automated flow" to "build a request/approval queue with a manual settlement step." Resolve this before estimating Phase 7 timeline.

- [ ] **Define Telebirr integration contract.** **Priority:** Critical. **Purpose:** Document provider references, amount rules, callback URLs, verification steps, expiry behavior, and reconciliation fields.
  - **Security considerations:** Provider credentials, signing secrets, and callback validation rules must be environment-specific and stored in the secrets manager.

- [ ] **Implement payment initiation.** **Priority:** Critical. **Purpose:** Create server-authoritative payment attempts for slot reservations, shared participants, and entrance tickets.
  - **Security considerations:** Amount, payable, user ownership, expiry, and provider metadata must be generated and validated server-side.
  - **Dependencies:** Payable contract, pricing snapshots, payment attempts.

- [ ] **Implement payment state machine.** **Priority:** Critical. **Purpose:** Make pending, initiated, provider_confirmed, verified, failed, expired, refunded, partially_refunded, and disputed transitions explicit.
  - **Dependencies:** Payment attempts, webhook events, reconciliation jobs, refund policy.

- [ ] **Implement webhook signature and authenticity verification.** **Priority:** Critical. **Purpose:** Reject forged or malformed Telebirr callbacks.
  - **Security considerations:** Verify signature or shared secret, timestamp tolerance if provided, provider transaction ID, amount, currency, and merchant reference.

- [ ] **Implement webhook idempotency keys.** **Priority:** Critical. **Purpose:** Process duplicate Telebirr callbacks exactly once per logical provider event or state transition.
  - **Security considerations:** Do not rely only on "already paid" checks; persist normalized idempotency keys and lock payment rows during processing.
  - **Performance considerations:** Index provider event IDs, merchant references, payment IDs, and processed status.
  - **Dependencies:** Webhook event table, payment state machine, transaction handling.

- [ ] **Handle out-of-order webhook events.** **Priority:** Critical. **Purpose:** Prevent late failure, duplicate success, or delayed confirmation events from moving payment state backward incorrectly.
  - **Security considerations:** Define allowed transitions and reject or quarantine impossible provider state changes for review.

- [ ] **Verify payments before fulfillment.** **Priority:** Critical. **Purpose:** Confirm provider-reported success before granting reservation, ticket, or QR access.
  - **Security considerations:** Match amount, currency, merchant reference, payable, and provider transaction ID before state transition.

- [ ] **Make payment confirmation atomic with access issuance.** **Priority:** Critical. **Purpose:** Avoid cases where money is captured but QR access is missing, or QR access exists without confirmed payment.
  - **Dependencies:** Transaction handling, QR issuance, audit logs, outbox events.

- [ ] **Implement failed-payment recovery.** **Priority:** High. **Purpose:** Let residents retry failed or abandoned payments without duplicating bookings or losing valid holds prematurely.
  - **Dependencies:** Payment attempts, hold expiry, user-facing status APIs.

- [ ] **Implement payment expiry jobs.** **Priority:** Critical. **Purpose:** Expire unpaid reservations, shared participant payments, slot holds, and entrance ticket attempts on time.
  - **Performance considerations:** Expiry jobs should be idempotent, indexed by expiration time, and safe under multiple workers.

- [ ] **Implement shared reservation payment aggregation.** **Priority:** Critical. **Purpose:** Confirm or cancel group reservations based on participant payment completion before deadline.
  - **Dependencies:** Participant payments, group state, notifications, refunds.

- [ ] **Implement refund and partial refund tracking.** **Priority:** High. **Purpose:** Support facility closures, group changes, cancellations, disputes, and payment correction workflows.
  - **Security considerations:** Refund initiation should require server policy checks and privileged admin approval where appropriate. **Depends on the Telebirr refund verification item above — do not finalize this item's implementation shape until that's resolved.**

- [ ] **Implement Telebirr reconciliation jobs.** **Priority:** Critical. **Purpose:** Compare internal records against provider records to detect missing callbacks, mismatched amounts, and unresolved payments.
  - **Performance considerations:** Reconciliation should run as a background job and alert on exceptions instead of blocking normal user flows.
  - **Dependencies:** Provider reporting access, payment attempts, webhook events, audit logs.

- [ ] **Implement payment audit trail.** **Priority:** Critical. **Purpose:** Record every payment initiation, provider callback, verification, state transition, expiry, refund, and reconciliation correction.
  - **Security considerations:** Payment audit entries should include actor or system actor, source, provider reference, old state, new state, and correlation ID.

- [ ] **Monitor payment health.** **Priority:** Critical. **Purpose:** Detect stuck pending payments, callback failures, reconciliation mismatches, provider latency, and unusual failure rates.
  - **Performance considerations:** Dashboards and alerts should segment by provider status, facility, booking type, and environment.

## Phase 8: Performance Optimization

- [ ] **Profile high-volume query paths.** **Priority:** Critical. **Purpose:** Measure slot availability, geolocation search, staff daily schedule, QR validation, resident booking lists, and analytics before guessing optimizations.
  - **Dependencies:** Observability, realistic test data, query tracing.

- [ ] **Optimize geolocation facility search.** **Priority:** Critical. **Purpose:** Return nearby facilities efficiently at city scale.
  - **Performance considerations:** Use spatial indexes, bounding boxes, distance ordering, filters, pagination, and cacheable public metadata.

- [ ] **Optimize slot availability lookups.** **Priority:** Critical. **Purpose:** Keep booking discovery fast during peak demand.
  - **Performance considerations:** Index by facility, court, date/time range, status, schedule exceptions, and active holds; avoid repeated N+1 schedule queries.

- [ ] **Optimize staff daily schedule queries.** **Priority:** High. **Purpose:** Load assigned facility schedules quickly for online and offline staff workflows.
  - **Performance considerations:** Query by facility/date/status and pre-shape payloads for mobile sync.

- [ ] **Optimize QR validation queries.** **Priority:** Critical. **Purpose:** Keep gate or facility entry scans responsive and reliable.
  - **Performance considerations:** Index QR token identifiers, status, payable type, payable ID, visit date, facility, and check-in dedupe keys.

- [ ] **Optimize entrance capacity purchase path.** **Priority:** Critical. **Purpose:** Maintain correctness under high contention without unacceptable latency.
  - **Performance considerations:** Keep capacity-locking transactions short and avoid performing provider calls inside database locks.

- [ ] **Add indexes tied to resident history views.** **Priority:** High. **Purpose:** Keep upcoming and past reservation/ticket lists fast for residents.
  - **Performance considerations:** Use composite indexes by user, status, visit date, and start time.

- [ ] **Add indexes tied to admin operations.** **Priority:** High. **Purpose:** Keep facility management, user support, staff assignment, payment search, and audit review usable.
  - **Performance considerations:** Index by target IDs, actor IDs, facility IDs, dates, statuses, and provider references used in filters.

- [ ] **Implement pagination on every list endpoint.** **Priority:** Critical. **Purpose:** Prevent unbounded response payloads and database scans.
  - **Performance considerations:** Use cursor pagination for high-volume chronological lists such as audit logs, notifications, payments, and check-ins.

- [ ] **Define caching for public facility data.** **Priority:** High. **Purpose:** Reduce repeated reads for mostly stable facility profiles, amenities, images, and public descriptions.
  - **Performance considerations:** Invalidate cache on admin edits and avoid mixing real-time availability into long-lived facility cache entries.

- [ ] **Define cautious caching for availability data.** **Priority:** High. **Purpose:** Improve availability reads without showing stale bookable slots as confirmed inventory.
  - **Performance considerations:** Use short TTLs or derived availability caches that are invalidated by holds, confirmations, cancellations, closures, and schedule changes.

- [ ] **Define cache invalidation triggers.** **Priority:** High. **Purpose:** Keep facility, schedule, availability, pricing, and capacity views consistent after admin or booking changes.
  - **Dependencies:** Admin events, booking events, payment confirmation, outbox jobs.

- [ ] **Prevent N+1 query patterns.** **Priority:** High. **Purpose:** Keep API latency stable as facilities, reservations, participants, and tickets grow.
  - **Performance considerations:** Use eager loading, batched loaders, or query shaping where list endpoints include related data.

- [ ] **Introduce read replicas when needed.** **Priority:** Medium. **Purpose:** Move analytics and read-heavy discovery traffic away from write-critical database paths.
  - **Performance considerations:** Avoid using lagging replicas for payment confirmation, capacity locking, QR validation, or conflict-sensitive booking writes.

- [ ] **Use connection pooling.** **Priority:** High. **Purpose:** Protect the database from connection exhaustion under horizontal API and worker scaling.
  - **Dependencies:** Database pooler, framework configuration, worker concurrency settings.

- [ ] **Partition high-volume tables when growth requires it.** **Priority:** Medium. **Purpose:** Keep audit logs, check-ins, payment events, sync records, and notifications manageable over time.
  - **Performance considerations:** Partition by time and align archival or retention jobs with partition boundaries.

- [ ] **Move non-critical work to background jobs.** **Priority:** High. **Purpose:** Keep user-facing APIs responsive while sending notifications, building analytics, expiring payments, and reconciling provider records asynchronously.
  - **Performance considerations:** Job handlers must be idempotent and observable with retry and dead-letter handling.

- [ ] **Set performance budgets and SLOs.** **Priority:** High. **Purpose:** Define acceptable latency and error rates for booking, payment, QR validation, sync, and admin operations.
  - **Dependencies:** Monitoring, load tests, incident response.

## Phase 9: Testing

- [ ] **Test domain state machines.** **Priority:** Critical. **Purpose:** Verify valid and invalid transitions for reservations, entrance tickets, payments, refunds, QR codes, and sync batches.
  - **Dependencies:** Unit test framework, domain factories.

- [ ] **Test API contracts.** **Priority:** High. **Purpose:** Ensure mobile, staff, and admin clients receive documented request and response shapes.
  - **Dependencies:** OpenAPI schema, contract test runner.

- [ ] **Test authentication flows.** **Priority:** Critical. **Purpose:** Verify registration, login, OTP, token refresh, logout, session revocation, and account recovery.
  - **Security considerations:** Include brute-force, enumeration, expired OTP, reused OTP, revoked token, and client-scope tests.

- [ ] **Test RBAC and facility scope.** **Priority:** Critical. **Purpose:** Prove residents, staff, admins, finance users, auditors, and system actors can only perform allowed actions.
  - **Security considerations:** Include negative tests for staff trying to access unassigned facilities and admins attempting actions outside assigned permissions.

- [ ] **Test input validation and injection resistance.** **Priority:** Critical. **Purpose:** Reject malformed, unsafe, oversized, or malicious payloads at API boundaries.
  - **Security considerations:** Include SQL injection strings, XSS payloads, invalid enum values, unexpected fields, file upload attacks, and impossible date/quantity values.

- [ ] **Test concurrent slot booking.** **Priority:** Critical. **Purpose:** Prove two users cannot confirm the same court and time under race conditions.
  - **Performance considerations:** Run tests with real database transactions, not mocked repository behavior.

- [ ] **Test concurrent entrance ticket purchases.** **Priority:** Critical. **Purpose:** Prove daily capacity cannot be oversold under simultaneous purchases.
  - **Performance considerations:** Include high-contention tests around the last available tickets.

- [ ] **Test payment webhook idempotency.** **Priority:** Critical. **Purpose:** Verify duplicate Telebirr callbacks cannot double-confirm, double-refund, or corrupt payment state.
  - **Security considerations:** Include duplicate event IDs, same provider transaction ID with changed payload, and repeated success callbacks.

- [ ] **Test out-of-order payment events.** **Priority:** Critical. **Purpose:** Verify late failure or delayed success callbacks do not move payment state incorrectly.
  - **Dependencies:** Payment state machine, webhook event records.

- [ ] **Test payment confirmation atomicity.** **Priority:** Critical. **Purpose:** Verify payment confirmation, booking/ticket state, QR issuance, audit logging, and outbox events remain consistent on failure.
  - **Dependencies:** Integration test database, fault injection hooks.

- [ ] **Test QR validation rules by booking type.** **Priority:** Critical. **Purpose:** Verify slot and entrance QR codes obey separate facility, date, time, quantity, status, and duplicate scan rules.
  - **Security considerations:** Include forged QR, revoked QR, wrong facility, wrong date, expired booking, refunded booking, and repeat scan cases.

- [ ] **Test offline sync pull.** **Priority:** Critical. **Purpose:** Verify staff devices receive only authorized, facility-scoped, date-scoped validation data.
  - **Security considerations:** Include revoked assignment, stale token, wrong facility, and oversized sync request cases.

- [ ] **Test offline sync push and conflict resolution.** **Priority:** Critical. **Purpose:** Verify delayed, duplicated, conflicting, or unauthorized offline check-ins are handled deterministically.
  - **Security considerations:** Include replayed sync batch IDs, tampered payloads, inactive staff assignments, and duplicate scan events.

- [ ] **Test shared reservation flows.** **Priority:** Critical. **Purpose:** Verify group creation, participant invite, participant payment, deadline expiry, cancellation, refund, and abuse rules.
  - **Dependencies:** Notifications, payments, background jobs.

- [ ] **Test admin audit logging.** **Priority:** Critical. **Purpose:** Verify pricing, capacity, schedule, facility, staff, role, refund, and user-support actions create immutable audit events.
  - **Security considerations:** Include tests that ordinary admins cannot edit or delete audit records.

- [ ] **Test analytics correctness.** **Priority:** High. **Purpose:** Verify revenue, usage, attendance, peak time, cancellation, refund, and trend reports match source operational data.
  - **Dependencies:** Analytics aggregates, payments, check-ins, reservations, tickets.

- [ ] **Run load tests for critical paths.** **Priority:** Critical. **Purpose:** Measure booking, entrance purchase, facility search, QR validation, payment webhook, and sync behavior under realistic load.
  - **Performance considerations:** Include peak-hour scenarios, high-contention capacity scenarios, and staff gate-entry scan bursts.

- [ ] **Run security tests.** **Priority:** Critical. **Purpose:** Validate OWASP controls, dependency scanning, auth hardening, rate limiting, upload controls, CSRF, CORS, and logging redaction.
  - **Dependencies:** Security test tooling, CI, staging environment.

- [ ] **Test database migrations.** **Priority:** High. **Purpose:** Verify migrations apply, roll forward safely, and preserve data across realistic production-sized samples.
  - **Dependencies:** Migration tooling, staging data strategy.

- [ ] **Test backup restoration.** **Priority:** Critical. **Purpose:** Prove backups can actually restore the platform within the required RPO/RTO.
  - **Security considerations:** Restore drills must protect production data and credentials.

- [ ] **Run end-to-end client workflow tests.** **Priority:** High. **Purpose:** Validate resident booking and ticket purchase, staff validation and sync, and admin management flows across the whole backend.
  - **Dependencies:** Test environment, fake Telebirr provider, seeded facilities.

## Phase 10: Deployment and Operations

- [ ] **Provision production infrastructure.** **Priority:** Critical. **Purpose:** Create production-grade API, worker, database, cache, queue, object storage, secrets, monitoring, and networking resources.
  - **Security considerations:** Use least-privilege access, private networking where possible, encrypted storage, and environment-specific credentials.

- [ ] **Create CI/CD pipeline.** **Priority:** Critical. **Purpose:** Automate build, test, security scan, migration review, deployment, and rollback steps.
  - **Security considerations:** CI secrets must be scoped, masked, and protected from untrusted branches or logs.

- [ ] **Define database migration release strategy.** **Priority:** Critical. **Purpose:** Deploy schema changes safely without downtime or data loss.
  - **Performance considerations:** Use expand-and-contract migrations for high-traffic tables and avoid long locks during peak hours.

- [ ] **Deploy stateless API services.** **Priority:** High. **Purpose:** Allow horizontal scaling and rolling deployments without losing sessions or jobs.
  - **Dependencies:** External session/token state, shared cache, load balancer.

- [ ] **Deploy background workers separately.** **Priority:** High. **Purpose:** Scale payment expiry, reconciliation, notifications, sync processing, and analytics work independently from API traffic.
  - **Performance considerations:** Configure worker concurrency and retry behavior to avoid overwhelming the database or Telebirr.

- [ ] **Configure centralized logging.** **Priority:** Critical. **Purpose:** Give operators searchable request, job, payment, QR, sync, admin, and security logs with correlation IDs.
  - **Security considerations:** Enforce log redaction and restricted access to sensitive operational logs.

- [ ] **Configure monitoring dashboards.** **Priority:** Critical. **Purpose:** Track API health, database health, queue depth, payment status, QR validation, sync failures, capacity conflicts, and auth abuse.
  - **Dependencies:** Metrics instrumentation, log aggregation, tracing.

- [ ] **Configure payment-specific alerts.** **Priority:** Critical. **Purpose:** Detect Telebirr callback failures, stuck pending payments, reconciliation mismatches, abnormal failure rates, and refund issues.
  - **Performance considerations:** Alert thresholds should separate provider outage, internal processing failure, and facility-specific anomalies.

- [ ] **Configure QR validation alerts.** **Priority:** Critical. **Purpose:** Detect scan failures, latency spikes, duplicate scan spikes, offline sync backlog, and facility-specific validation anomalies.
  - **Security considerations:** Alert on suspicious replay patterns or staff scanning outside assigned scope.

- [ ] **Configure health checks.** **Priority:** High. **Purpose:** Let load balancers and deployment systems route traffic only to ready services.
  - **Dependencies:** API readiness, worker readiness, database, cache, queue, storage checks.

- [ ] **Implement backup schedule and retention.** **Priority:** Critical. **Purpose:** Protect operational, payment, audit, QR, and analytics data from loss.
  - **Security considerations:** Encrypt backups, restrict restore privileges, and keep retention aligned with legal and operational needs.

- [ ] **Run scheduled restore drills.** **Priority:** Critical. **Purpose:** Verify the team can restore service and data within defined RPO/RTO.
  - **Dependencies:** Restore environment, documented runbooks, backup monitoring.

- [ ] **Define disaster recovery plan.** **Priority:** Critical. **Purpose:** Prepare for database failure, region outage, provider outage, bad deployment, credential compromise, and data corruption.
  - **Security considerations:** Include credential rotation and incident containment steps.

- [ ] **Create incident response runbooks.** **Priority:** Critical. **Purpose:** Give operators clear actions for payment incidents, QR validation outages, capacity oversell risk, staff sync failures, and admin account compromise.
  - **Dependencies:** Monitoring dashboards, alert routing, on-call ownership.

- [ ] **Configure deployment rollback strategy.** **Priority:** High. **Purpose:** Recover quickly from bad releases without corrupting migrations or payment state.
  - **Dependencies:** Release versioning, migration policy, feature flags.

- [ ] **Use feature flags for risky rollouts.** **Priority:** Medium. **Purpose:** Control staged release of new payment, booking, sync, analytics, or admin capabilities.
  - **Security considerations:** Feature flags must not bypass authorization checks.

- [ ] **Set up dependency and container scanning in CI.** **Priority:** High. **Purpose:** Block or flag known vulnerable dependencies and runtime images before production deployment.
  - **Dependencies:** CI/CD, package manager, container registry.

- [ ] **Define access control for production operations.** **Priority:** Critical. **Purpose:** Limit who can deploy, view logs, access databases, rotate secrets, run exports, and administer staff/admin accounts.
  - **Security considerations:** Use least privilege, MFA, audit logs, and time-bound access for sensitive operations.

- [ ] **Define data export and reporting governance.** **Priority:** High. **Purpose:** Ensure government reporting does not become an uncontrolled path to personal or payment data exposure.
  - **Security considerations:** Exports require permissions, field redaction, audit logs, retention limits, and expiring download links.

- [ ] **Create operational handoff documentation.** **Priority:** High. **Purpose:** Document architecture, environments, runbooks, rollback, backup restore, payment reconciliation, QR validation support, and staff sync troubleshooting.
  - **Dependencies:** Final architecture diagrams, API docs, monitoring dashboards, incident processes.

## Phase 11: Production Readiness Gate

- [ ] **Confirm all critical paths have ownership.** **Priority:** Critical. **Purpose:** Assign responsible owners for auth, booking, entrance capacity, payments, QR, offline sync, admin, analytics, infrastructure, and security.

- [ ] **Confirm all public money flows are reconciled.** **Priority:** Critical. **Purpose:** Ensure every Telebirr transaction can be traced to payment state, booking state, QR issuance, audit log, and reconciliation outcome.
  - **Security considerations:** Reconciliation access must be limited to authorized finance and system operators.

- [ ] **Confirm every staff action is accountable.** **Priority:** Critical. **Purpose:** Ensure QR validation, offline sync, attendance edits, and facility-scoped schedule access are tied to staff identity, device, facility, and time.

- [ ] **Confirm every admin action is accountable.** **Priority:** Critical. **Purpose:** Ensure facility, pricing, capacity, role, staff assignment, refund, and user-support changes produce immutable audit records.

- [ ] **Confirm no booking type bypasses shared payment and QR rules.** **Priority:** Critical. **Purpose:** Verify slot reservations, shared participant payments, and entrance tickets all use the same hardened payment and QR foundation.

- [ ] **Confirm capacity and conflict controls run in the database transaction.** **Priority:** Critical. **Purpose:** Verify slot conflicts and entrance capacity are protected by database-enforced concurrency controls, not only pre-checks.

- [ ] **Confirm offline sync is production-ready before field deployment.** **Priority:** Critical. **Purpose:** Verify staff can validate the day's records offline, sync later, resolve conflicts, and preserve auditability.
  - **Security considerations:** Device revocation, assignment revocation, stale bundles, and replayed sync batches must be tested before launch.

- [ ] **Confirm monitoring covers silent public-failure paths.** **Priority:** Critical. **Purpose:** Ensure payment failures, QR validation failures, capacity oversell signals, and sync backlogs trigger alerts.

- [ ] **Confirm backup restore has been tested.** **Priority:** Critical. **Purpose:** Prove the platform can recover from data loss or corruption within the documented RPO/RTO.

- [ ] **Confirm security review is complete.** **Priority:** Critical. **Purpose:** Verify OWASP coverage, auth, RBAC, rate limits, secrets, environment isolation, uploads, CSRF, CORS, logging redaction, and dependency scanning before launch.
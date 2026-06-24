# Naming Conventions

Binding naming reference for the backend of the Public Recreation Facility Management Platform for Addis Ababa. Stack target: Node.js, TypeScript, PostgreSQL.

## 1. General Principles

Use clarity over brevity, consistency over cleverness, and domain-specific names over generic names. Do not abbreviate unless the abbreviation is explicitly whitelisted here: `api`, `db`, `id`, `jwt`, `otp`, `qr`, `rbac`, `url`, `uuid`. When two rules could reasonably apply, the more specific domain boundary wins: `slotReservation` and `entranceTicket` are preferred over generic `reservation` because this system has two distinct booking models.

- **Rule:** Prefer full domain terms over shortened names.
  - **Correct:** `entranceTicketCapacity`
  - **Incorrect:** `entryCap`

- **Rule:** Use a specific booking model name whenever the concept belongs to slot-based or entrance-based booking.
  - **Correct:** `slotReservationPayment`
  - **Incorrect:** `reservationPayment`

- **Rule:** Use whitelisted abbreviations only in the casing required by the layer.
  - **Correct:** `qrCode`, `QR_CODE_TTL_SECONDS`, `qr_codes`
  - **Incorrect:** `QRCode`, `qrcode`, `quickResponseCode`

- **Rule:** Never create a new synonym for an established domain concept.
  - **Correct:** `entranceTicket`
  - **Incorrect:** `entryPass`

## 2. Database Naming

### Table Names

- **Rule:** PostgreSQL table names must be plural `snake_case`. There are no singular table name exceptions.
  - **Correct:** `slot_reservations`
  - **Incorrect:** `slot_reservation`

- **Rule:** Generic `reservations` is forbidden because slot reservations and entrance tickets are separate models.
  - **Correct:** `slot_reservations`
  - **Incorrect:** `reservations`

- **Rule:** A table with its own lifecycle must be named as a domain entity, not as a generic junction.
  - **Correct:** `shared_reservation_participants`
  - **Incorrect:** `reservation_users`

### Column Names

- **Rule:** PostgreSQL columns must use `snake_case`.
  - **Correct:** `payment_expires_at`
  - **Incorrect:** `paymentExpiresAt`

- **Rule:** Column names must include the booking model when ambiguity is possible.
  - **Correct:** `slot_reservation_id`
  - **Incorrect:** `reservation_id`

- **Rule:** Column names must describe stored data, not client behavior.
  - **Correct:** `visit_date`
  - **Incorrect:** `selected_date`

- **Rule:** Snapshot columns (preserving a price or name at the time of a transaction, so later admin edits don't corrupt historical receipts) must use `<field>_at_booking` or `<field>_snapshot`.
  - **Correct:** `price_at_booking`, `facility_name_snapshot`
  - **Incorrect:** `price`, `facility_name` reused from the live facility record on a historical payment row

### Primary Keys

- **Rule:** Every table primary key column is named `id`.
  - **Correct:** `id`
  - **Incorrect:** `facility_id` as the primary key column on `facilities`

- **Rule:** Every primary key must be a UUID, preferably UUIDv7 where the database/runtime supports it; serial integer IDs are forbidden. See DECISIONS.md — this is a schema-wide architecture decision, recorded there as the source of truth, restated here for naming consistency.
  - **Correct:** `id uuid primary key`
  - **Incorrect:** `id serial primary key`

### Foreign Keys

- **Rule:** Foreign key columns must be named `<referenced_singular_table_name>_id`.
  - **Correct:** `facility_id`
  - **Incorrect:** `facilityId`

- **Rule:** Foreign keys to slot reservations must use `slot_reservation_id`.
  - **Correct:** `slot_reservation_id`
  - **Incorrect:** `reservation_id`

- **Rule:** Foreign keys to shared reservation participants must use `shared_reservation_participant_id`.
  - **Correct:** `shared_reservation_participant_id`
  - **Incorrect:** `participant_id`

### Polymorphic References

- **Rule:** Polymorphic references must always use the exact pair `<subject>_type` and `<subject>_id`.
  - **Correct:** `payable_type`, `payable_id`
  - **Incorrect:** `payment_target_type`, `payment_target_id`

- **Rule:** Approved polymorphic pair names are `payable_type/payable_id`, `scannable_type/scannable_id`, `notifiable_type/notifiable_id`, `target_type/target_id`, `actor_type/actor_id`, and `aggregate_type/aggregate_id`. See DECISIONS.md — the existence and scope of each pair is a schema decision recorded there; this section governs only their spelling.
  - **Correct:** `target_type`, `target_id` on `audit_logs`
  - **Incorrect:** `audited_entity_type`, `audited_entity_id`

- **Rule:** Polymorphic type values must be lower `snake_case` singular domain tokens from the approved list.
  - **Correct:** `slot_reservation`, `entrance_ticket`, `shared_reservation_participant`
  - **Incorrect:** `SlotReservation`, `entranceTickets`, `participant`

- **Rule:** Do not use polymorphic references when a normal foreign key is exact and sufficient.
  - **Correct:** `staff_assignment_id` on a staff sync record tied only to staff assignments
  - **Incorrect:** `assignable_type`, `assignable_id`

### Boolean Columns

- **Rule:** Boolean columns must begin with `is_`, `has_`, or `can_`.
  - **Correct:** `is_active`
  - **Incorrect:** `active`

- **Rule:** Use `is_` for state, `has_` for possession or completion, and `can_` for permissions or capabilities.
  - **Correct:** `can_validate_qr`
  - **Incorrect:** `validate_qr`

### Timestamp Columns

- **Rule:** Every table must include `created_at` and `updated_at`.
  - **Correct:** `created_at`, `updated_at`
  - **Incorrect:** `createdOn`, `modified_at`

- **Rule:** Soft deletion must use `deleted_at`.
  - **Correct:** `deleted_at`
  - **Incorrect:** `removed_at`

- **Rule:** Lifecycle timestamps must use `<past_tense_verb>_at`.
  - **Correct:** `paid_at`, `checked_in_at`, `expires_at`
  - **Incorrect:** `payment_time`, `checkin_date`

### Enum Columns

- **Rule:** Status columns must include the domain noun: `<domain>_status`.
  - **Correct:** `payment_status`
  - **Incorrect:** `status` on `payments`

- **Rule:** Enum values stored in PostgreSQL must be lower `snake_case`.
  - **Correct:** `pending_payment`
  - **Incorrect:** `PENDING_PAYMENT`

- **Rule:** Use American English spelling for status values.
  - **Correct:** `canceled`
  - **Incorrect:** `cancelled`

### Junction and Relationship Tables

- **Rule:** Pure many-to-many tables must use `<owner_plural>_<related_plural>`.
  - **Correct:** `role_permissions`
  - **Incorrect:** `permissions_roles`

- **Rule:** Relationship tables with attributes must use the domain entity name instead of a generic join name.
  - **Correct:** `staff_assignments`
  - **Incorrect:** `staff_facilities`

### Index Names

- **Rule:** Non-unique indexes must use `idx_<table>__<column_or_purpose>`.
  - **Correct:** `idx_slot_reservations__facility_id_start_time`
  - **Incorrect:** `slot_reservations_facility_id_start_time_index`

- **Rule:** Unique indexes must use `uidx_<table>__<column_or_purpose>`.
  - **Correct:** `uidx_facility_capacities__facility_id_capacity_date`
  - **Incorrect:** `unique_facility_day`

- **Rule:** Partial indexes must end with `__where_<condition_token>`.
  - **Correct:** `idx_slot_reservations__court_id_time_range__where_active`
  - **Incorrect:** `idx_active_slots`

### Constraint Names

- **Rule:** Primary key constraints must use `pk_<table>`.
  - **Correct:** `pk_payments`
  - **Incorrect:** `payments_pkey`

- **Rule:** Foreign key constraints must use `fk_<table>__<column>__<referenced_table>`.
  - **Correct:** `fk_payments__user_id__users`
  - **Incorrect:** `payments_user_id_fkey`

- **Rule:** Unique constraints must use `uq_<table>__<columns>`.
  - **Correct:** `uq_staff_assignments__staff_user_id_facility_id_starts_at`
  - **Incorrect:** `unique_staff_assignment`

- **Rule:** Check constraints must use `chk_<table>__<condition_token>`.
  - **Correct:** `chk_entrance_tickets__quantity_positive`
  - **Incorrect:** `quantity_check`

- **Rule:** Exclusion constraints must use `excl_<table>__<purpose>`.
  - **Correct:** `excl_slot_reservations__court_time_overlap`
  - **Incorrect:** `no_overlap`

## 3. TypeScript and Code Naming

### File Names

- **Rule:** TypeScript source files must use `kebab-case`.
  - **Correct:** `slot-reservations.service.ts`
  - **Incorrect:** `SlotReservationsService.ts`

- **Rule:** Controller files must be named `<resource-plural>.controller.ts`.
  - **Correct:** `entrance-tickets.controller.ts`
  - **Incorrect:** `entranceTicket.controller.ts`

- **Rule:** Service files must be named `<resource-plural>.service.ts`.
  - **Correct:** `payments.service.ts`
  - **Incorrect:** `payment-service.ts`

- **Rule:** Repository files must be named `<resource-plural>.repository.ts`.
  - **Correct:** `facility-capacities.repository.ts`
  - **Incorrect:** `facilityCapacity.repo.ts`

- **Rule:** ORM model files must be named `<entity-singular>.model.ts`.
  - **Correct:** `slot-reservation.model.ts`
  - **Incorrect:** `reservation.model.ts`

- **Rule:** Type and DTO files must be named `<resource-plural>.types.ts`.
  - **Correct:** `shared-reservations.types.ts`
  - **Incorrect:** `sharedReservation.dto.ts`

- **Rule:** Utility files must be named by purpose, not by vague helper labels.
  - **Correct:** `qr-token-signing.util.ts`
  - **Incorrect:** `helpers.ts`

### Folder and Module Names

- **Rule:** Top-level module folders must be exactly: `auth`, `facilities`, `slot-booking`, `entrance-ticketing`, `payments`, `qr`, `notifications`, `admin-analytics`, `sync`, `audit-logs`.
  - **Correct:** `slot-booking/slot-reservations.service.ts`
  - **Incorrect:** `booking/reservations.service.ts`

- **Rule:** Shared reservations belong under `slot-booking` because they reserve slot-based facilities.
  - **Correct:** `slot-booking/shared-reservations.service.ts`
  - **Incorrect:** `shared-booking/shared-reservations.service.ts`

- **Rule:** Entrance capacity code belongs under `entrance-ticketing`.
  - **Correct:** `entrance-ticketing/facility-capacities.repository.ts`
  - **Incorrect:** `facilities/capacity-locks.repository.ts`

- **Rule:** Telebirr webhook handling and payment attempt tracking belong under `payments`, not a separate `telebirr` or `webhooks` folder.
  - **Correct:** `payments/webhook-events.service.ts`
  - **Incorrect:** `webhooks/telebirr.service.ts`

- **Rule:** Slot holds belong under `slot-booking`, alongside slot reservations, since a hold is a pre-confirmation state of the same lifecycle.
  - **Correct:** `slot-booking/slot-holds.service.ts`
  - **Incorrect:** `payments/slot-holds.service.ts`

### Variables

- **Rule:** Variables must use `camelCase`.
  - **Correct:** `entranceTicketQuantity`
  - **Incorrect:** `entrance_ticket_quantity`

- **Rule:** Variables must be descriptive; single-letter variables are allowed only for short loop indices such as `i` or `j`.
  - **Correct:** `slotReservationStartTime`
  - **Incorrect:** `s`

- **Rule:** Avoid generic booking variables when the model is known.
  - **Correct:** `slotReservationId`
  - **Incorrect:** `bookingId`

### Functions

- **Rule:** Function names must be verb-first and use `camelCase`.
  - **Correct:** `validateQrCode`
  - **Incorrect:** `qrCodeValidation`

- **Rule:** CRUD functions must use only these verbs: `get`, `list`, `create`, `update`, `delete`, `archive`, `restore`.
  - **Correct:** `listFacilities`
  - **Incorrect:** `fetchFacilities`

- **Rule:** Booking functions must use only these domain verbs: `hold`, `lock`, `release`, `reserve`, `confirm`, `cancel`, `expire`, `checkIn`.
  - **Correct:** `lockEntranceCapacity`
  - **Incorrect:** `takeCapacity`

- **Rule:** Payment functions must use only these domain verbs: `initiate`, `verify`, `confirm`, `fail`, `expire`, `refund`, `reconcile`.
  - **Correct:** `reconcileTelebirrPayment`
  - **Incorrect:** `fixPayment`

- **Rule:** QR functions must use only these domain verbs: `issue`, `sign`, `validate`, `revoke`, `redeem`.
  - **Correct:** `redeemEntranceTicketQrCode`
  - **Incorrect:** `useQr`

- **Rule:** Sync functions must use only these domain verbs: `pull`, `push`, `apply`, `reject`, `resolve`.
  - **Correct:** `applyOfflineCheckIns`
  - **Incorrect:** `processStuff`

### Classes

- **Rule:** Classes must use `PascalCase`.
  - **Correct:** `EntranceTicketsService`
  - **Incorrect:** `entranceTicketsService`

- **Rule:** Class names must end with the exact role suffix: `Controller`, `Service`, `Repository`, `Worker`, `Job`, `Policy`, `Mapper`, or `Validator`.
  - **Correct:** `SlotReservationsRepository`
  - **Incorrect:** `SlotReservationData`

- **Rule:** Class names must include the specific booking model when relevant.
  - **Correct:** `EntranceTicketsController`
  - **Incorrect:** `ReservationsController`

### Interfaces and Types

- **Rule:** Interfaces and types must use `PascalCase` with no `I` prefix.
  - **Correct:** `StaffAssignment`
  - **Incorrect:** `IStaffAssignment`

- **Rule:** Request, response, query, params, result, and row shapes must use the exact suffixes `Request`, `Response`, `Query`, `Params`, `Result`, and `Row`.
  - **Correct:** `CreateEntranceTicketRequest`
  - **Incorrect:** `EntranceTicketPayload`

- **Rule:** Database row types must use the entity name plus `Row`.
  - **Correct:** `SlotReservationRow`
  - **Incorrect:** `SlotReservationDbModel`

### Code Enums

- **Rule:** TypeScript enum or literal-union type names must use `PascalCase` and match the DB status domain name.
  - **Correct:** `PaymentStatus`
  - **Incorrect:** `PaymentState`

- **Rule:** Code enum values must map exactly to lower `snake_case` DB enum strings.
  - **Correct:** `PaymentStatus.Verified = 'verified'`
  - **Incorrect:** `PaymentStatus.Verified = 'VERIFIED'`

### Constants

- **Rule:** True compile-time constants must use `UPPER_SNAKE_CASE`.
  - **Correct:** `PAYMENT_EXPIRY_MINUTES`
  - **Incorrect:** `paymentExpiryMinutes` for a hardcoded constant

- **Rule:** Runtime configuration values must use `camelCase` in code, even when loaded from upper `SNAKE_CASE` environment variables.
  - **Correct:** `telebirrMerchantId`
  - **Incorrect:** `TELEBIRR_MERCHANT_ID` as an in-code variable

### Boolean Code Names

- **Rule:** Boolean variables and boolean-returning functions must begin with `is`, `has`, or `can`.
  - **Correct:** `isSlotReservationExpired`
  - **Incorrect:** `slotReservationExpired`

- **Rule:** Use `can` only for permissions or capabilities.
  - **Correct:** `canValidateQrCode`
  - **Incorrect:** `canEntranceTicketPaid`

## 4. API Naming

### URL Paths

- **Rule:** API paths must start with `/v1`.
  - **Correct:** `/v1/entrance-tickets`
  - **Incorrect:** `/entrance-tickets`

- **Rule:** Resource path segments must be plural `kebab-case`.
  - **Correct:** `/v1/slot-reservations`
  - **Incorrect:** `/v1/slotReservations`

- **Rule:** URL nesting must not exceed two resource levels after `/v1`.
  - **Correct:** `/v1/facilities/{facilityId}/courts`
  - **Incorrect:** `/v1/cities/{cityId}/facilities/{facilityId}/courts/{courtId}/schedules`

- **Rule:** Use noun resources for state changes rather than arbitrary verbs.
  - **Correct:** `POST /v1/slot-reservations/{slotReservationId}/cancellations`
  - **Incorrect:** `POST /v1/slot-reservations/{slotReservationId}/cancel`

- **Rule:** QR validation requests must use `qr-validations` as the resource.
  - **Correct:** `POST /v1/qr-validations`
  - **Incorrect:** `POST /v1/qr/validate`

- **Rule:** A staff sync operation creates a `sync-batch`; individual record-level results are nested under it as `entries`. Do not expose `sync-queue-entries` as a flat top-level resource — it has no meaning outside the batch that produced it.
  - **Correct:** `POST /v1/sync-batches`, then `GET /v1/sync-batches/{syncBatchId}/entries`
  - **Incorrect:** `POST /v1/staff/sync`, `GET /v1/sync-queue-entries`

- **Rule:** Slot holds and payment attempts are internal lifecycle records, not independently addressable public resources. They are created and queried as part of the slot-reservation and payment flows, not given their own top-level path.
  - **Correct:** A hold is created as a side effect of `POST /v1/slot-reservations`; a payment attempt is created as a side effect of `POST /v1/payments`
  - **Incorrect:** `POST /v1/slot-holds`, `GET /v1/payment-attempts` as standalone client-facing endpoints

### Query Parameters

- **Rule:** Query parameters must use `camelCase`.
  - **Correct:** `facilityType=pool`
  - **Incorrect:** `facility_type=pool`

- **Rule:** ID query parameters must end in `Id`.
  - **Correct:** `facilityId=...`
  - **Incorrect:** `facility_id=...`

### JSON Request and Response Fields

- **Rule:** API JSON request and response fields must use `camelCase`.
  - **Correct:** `paymentStatus`
  - **Incorrect:** `payment_status`

- **Rule:** The API-to-database casing translation must live in mapper files named `<resource-plural>.mapper.ts`.
  - **Correct:** `entrance-tickets.mapper.ts`
  - **Incorrect:** inline `payment_status` usage in `entrance-tickets.controller.ts`

- **Rule:** Public API fields must use `id`, not `<entity>Id`, for the primary identifier of the returned resource.
  - **Correct:** `id` inside an entrance ticket response
  - **Incorrect:** `entranceTicketId` inside the entrance ticket object itself

### Pagination, Sorting, and Filtering

- **Rule:** List endpoints must use cursor pagination with `cursor` and `pageSize`.
  - **Correct:** `/v1/facilities?cursor=abc&pageSize=25`
  - **Incorrect:** `/v1/facilities?page=1&limit=25`

- **Rule:** Paginated responses must return `nextCursor` and `hasMore`.
  - **Correct:** `nextCursor`, `hasMore`
  - **Incorrect:** `next_page`, `more`

- **Rule:** Sorting must use `sortBy` and `sortDirection`.
  - **Correct:** `sortBy=createdAt&sortDirection=desc`
  - **Incorrect:** `order=created_at_desc`

- **Rule:** Filter query parameters must use direct domain names, not a generic `filter` object in the URL.
  - **Correct:** `reservationStatus=confirmed&facilityType=tennis`
  - **Incorrect:** `filter[status]=confirmed&filter[type]=tennis`

- **Rule:** Geolocation query parameters must be exactly `nearLat`, `nearLng`, and `radiusMeters`.
  - **Correct:** `nearLat=9.03&nearLng=38.74&radiusMeters=3000`
  - **Incorrect:** `lat=9.03&lng=38.74&radius=3`

### Error Responses

- **Rule:** Error responses must use the exact top-level shape `{ "error": { "code", "message", "details", "correlationId" } }`.
  - **Correct:** `error.correlationId`
  - **Incorrect:** `requestId`

- **Rule:** Error codes must use upper `SNAKE_CASE`.
  - **Correct:** `ENTRANCE_CAPACITY_EXHAUSTED`
  - **Incorrect:** `entranceCapacityExhausted`

## 5. Domain-Specific Naming Table

This table is the single lookup for core entity names across layers. If you're about to invent a name and it isn't here, stop and check the Ambiguity Protocol before proceeding.

| Domain entity | DB table | TypeScript model/type | API resource path |
|---|---|---|---|
| Users | `users` | `User` | `/v1/users` |
| Roles | `roles` | `Role` | `/v1/roles` |
| Permissions | `permissions` | `Permission` | `/v1/permissions` |
| Facilities | `facilities` | `Facility` | `/v1/facilities` |
| Courts | `courts` | `Court` | `/v1/facilities/{facilityId}/courts` |
| Schedules | `facility_schedules` | `FacilitySchedule` | `/v1/facilities/{facilityId}/schedules` |
| SlotReservations | `slot_reservations` | `SlotReservation` | `/v1/slot-reservations` |
| SlotHolds | `slot_holds` | `SlotHold` | Internal — created as a side effect of `POST /v1/slot-reservations`, not standalone |
| SharedReservations | `shared_reservations` | `SharedReservation` | `/v1/shared-reservations` |
| Participants | `shared_reservation_participants` | `SharedReservationParticipant` | `/v1/shared-reservations/{sharedReservationId}/participants` |
| EntranceTickets | `entrance_tickets` | `EntranceTicket` | `/v1/entrance-tickets` |
| FacilityCapacity | `facility_capacities` | `FacilityCapacity` | `/v1/facilities/{facilityId}/capacities` |
| Payments | `payments` | `Payment` | `/v1/payments` |
| PaymentAttempts | `payment_attempts` | `PaymentAttempt` | Internal — surfaced via payment status on `/v1/payments/{id}`, not standalone |
| WebhookEvents | `webhook_events` | `WebhookEvent` | Internal — Telebirr provider callback target, not user-facing |
| QRCodes | `qr_codes` | `QrCode` | `/v1/qr-codes` |
| CheckIns | `check_ins` | `CheckIn` | `/v1/check-ins` |
| StaffAssignments | `staff_assignments` | `StaffAssignment` | `/v1/staff-assignments` |
| AuditLogs | `audit_logs` | `AuditLog` | `/v1/audit-logs` |
| Notifications | `notifications` | `Notification` | `/v1/notifications` |
| SyncBatches | `sync_batches` | `SyncBatch` | `/v1/sync-batches` |
| SyncQueueEntries | `sync_queue_entries` | `SyncQueueEntry` | `/v1/sync-batches/{syncBatchId}/entries` |
| AnalyticsEvents | `analytics_events` | `AnalyticsEvent` | Internal — write-side capture, not directly exposed |
| AnalyticsReports | (computed: materialized views / aggregation jobs over `analytics_events` and source tables — no single backing table) | `AnalyticsReport` | `/v1/analytics-reports` |

- **Rule:** The domain table names above are canonical.
  - **Correct:** `SlotReservation`
  - **Incorrect:** `Booking`

- **Rule:** The term `Reservation` without `Slot` is reserved only for checklist prose and must not be used in code, API paths, table names, or variables.
  - **Correct:** `slotReservation`
  - **Incorrect:** `reservation`

- **Rule:** `AnalyticsEvents` (what gets written) and `AnalyticsReports` (what gets read) are never the same object in code or API responses. A report is computed from events plus source tables; it is not a renamed event.
  - **Correct:** A background job aggregates `analytics_events` into a materialized view queried by `GET /v1/analytics-reports`
  - **Incorrect:** Returning rows from `analytics_events` directly as the response to `/v1/analytics-reports`

## 6. Status and Enum Value Naming

### Reservation Status

Use this exact DB column name: `reservation_status`.

Allowed values:

- `held`
- `pending_payment`
- `confirmed`
- `checked_in`
- `completed`
- `canceled`
- `expired`
- `refunded`
- `disputed`

- **Rule:** Slot reservation status values must be used exactly as listed.
  - **Correct:** `pending_payment`
  - **Incorrect:** `pending`

- **Rule:** Do not use `cancelled`, `voided`, or `removed` for a canceled slot reservation.
  - **Correct:** `canceled`
  - **Incorrect:** `voided`

### Payment Status

Use this exact DB column name: `payment_status`.

Allowed values:

- `pending`
- `initiated`
- `provider_confirmed`
- `verified`
- `failed`
- `expired`
- `refunded`
- `partially_refunded`
- `disputed`

- **Rule:** Payment status values must represent provider and internal verification stages separately.
  - **Correct:** `provider_confirmed`, then `verified`
  - **Incorrect:** `paid`

- **Rule:** Do not use `complete` or `success` for verified payments.
  - **Correct:** `verified`
  - **Incorrect:** `success`

### Ticket Status

Use this exact DB column name: `ticket_status`.

Allowed values:

- `pending_payment`
- `confirmed`
- `partially_used`
- `fully_used`
- `canceled`
- `expired`
- `refunded`
- `partially_refunded`
- `disputed`

- **Rule:** Entrance ticket usage must use quantity-aware status values.
  - **Correct:** `partially_used`
  - **Incorrect:** `checked_in`

- **Rule:** Do not reuse `reservation_status` for entrance tickets.
  - **Correct:** `ticket_status`
  - **Incorrect:** `reservation_status` on `entrance_tickets`

### Sync Status

Use this exact DB column name: `sync_status`. Applies to both `sync_batches` (overall batch outcome) and `sync_queue_entries` (per-record outcome).

Allowed values:

- `pending`
- `processing`
- `applied`
- `partially_applied`
- `conflicted`
- `rejected`
- `failed`

- **Rule:** Offline sync status values must distinguish validation conflicts from infrastructure failures.
  - **Correct:** `conflicted`
  - **Incorrect:** `failed` for a duplicate offline check-in conflict

- **Rule:** Do not use vague sync terms.
  - **Correct:** `partially_applied`
  - **Incorrect:** `done_with_errors`

- **Rule:** A `sync_batches` row's status must be derived from its `sync_queue_entries`, not set independently — `partially_applied` on the batch means at least one entry was `applied` and at least one was `conflicted`, `rejected`, or `failed`.
  - **Correct:** Batch status computed from entry statuses on write
  - **Incorrect:** Setting batch status to `applied` while entries remain `pending`

## 7. Git, Branch, and Commit Naming

Branch and commit prefixes below assume Claude Code (or an equivalent AI coding tool) as the build assistant. If a different tool is used, replace `codex` with that tool's identifier — keep the rest of the pattern.

- **Rule:** Branch names must use `<tool>/phase-<two_digit_phase>-<checklist-item-slug>`.
  - **Correct:** `claude/phase-03-facility-capacity-constraints`
  - **Incorrect:** `claude/backend-work`

- **Rule:** Branch slugs must use lowercase `kebab-case` and reference an item or topic from `BACKEND_BUILD_CHECKLIST.md`.
  - **Correct:** `claude/phase-07-telebirr-webhook-idempotency`
  - **Incorrect:** `claude/telebirrFix`

- **Rule:** Commit messages must use `phase-<two_digit_phase>: <imperative summary> [checklist:<item-slug>]`.
  - **Correct:** `phase-05: add staff sync batch endpoints [checklist:staff-offline-sync-push-apis]`
  - **Incorrect:** `finished sync stuff`

- **Rule:** Commit summaries must name the affected domain.
  - **Correct:** `phase-06: lock entrance capacity purchases [checklist:entrance-capacity-locking]`
  - **Incorrect:** `phase-06: add locking [checklist:business-logic]`

## 8. Environment Variable Naming

- **Rule:** Environment variables must use upper `SNAKE_CASE`.
  - **Correct:** `TELEBIRR_MERCHANT_ID`
  - **Incorrect:** `telebirrMerchantId`

- **Rule:** Environment variables must be prefixed by service area.
  - **Correct:** `DB_PRIMARY_URL`
  - **Incorrect:** `DATABASE_URL`

- **Rule:** Approved service-area prefixes are `APP_`, `DB_`, `REDIS_`, `JWT_`, `TELEBIRR_`, `QUEUE_`, `STORAGE_`, `RATE_LIMIT_`, `SYNC_`, `QR_`, `OTEL_`, and `LOG_`.
  - **Correct:** `QR_SIGNING_SECRET`
  - **Incorrect:** `SIGNING_SECRET`

- **Rule:** Secrets must follow the same naming discipline as non-secret configuration.
  - **Correct:** `TELEBIRR_CLIENT_SECRET`
  - **Incorrect:** `SECRET_KEY`

- **Rule:** Environment variables must not encode environment names unless the variable is used by deployment tooling.
  - **Correct:** `DB_PRIMARY_URL` in production secrets
  - **Incorrect:** `PROD_DB_PRIMARY_URL` inside the production runtime

- **Rule:** Boolean environment variables must use positive names beginning with `APP_`, `SYNC_`, `QR_`, or another approved service prefix plus `ENABLE_`.
  - **Correct:** `SYNC_ENABLE_OFFLINE_PULL`
  - **Incorrect:** `DISABLE_SYNC`

## Ambiguity Protocol

If a new entity or concept does not clearly fit an existing pattern:
1. Check the Domain-Specific Naming Table (Section 5) first — most concepts already have a canonical name there.
2. If genuinely new, choose the closest existing analog, use the more specific domain boundary name, and record it in DECISIONS.md if it implies a schema or architecture choice (new table, new polymorphic pair, new status enum) — not just a naming format choice.
3. Flag the new term for project owner confirmation before it becomes permanent. Do not invent synonyms silently.
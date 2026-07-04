# Phase 5 — APIs — Learning Guide

Append-only build log entries for Phase 05 checklist items. New entries go at the bottom.

## Build facility discovery API core

- **What was done:** Added public `GET /v1/facilities` and `GET /v1/facilities/{facilityId}` routes with strict Zod query/parameter validation, active-record filtering, text and facility-type filters, optional radius-bounded PostGIS search, deterministic keyset pagination, public response mapping, and concrete OpenAPI response schemas. Nearby cursors retain the exact database distance while the response rounds meters for clients, and every cursor carries a canonical query key so changing filters invalidates it instead of silently continuing a different result set.

- **Why and verification:** This is the next runnable step in the resident-to-check-in vertical slice and uses the facility schema plus pagination foundation against a real consumer. Tests cover partial-coordinate rejection, malformed IDs, public auth allowlisting, filtered pages, cursor replay rejection, inactive-resource hiding, `ST_DWithin` radius behavior, distance ordering, and keyset continuation; 160 unit/E2E tests and 26 PostGIS integration tests pass alongside typecheck, lint, build, and OpenAPI generation.

- **Non-obvious gotcha:** `ST_Distance` must remain unrounded inside the cursor because comparing a rounded continuation value against the exact SQL sort expression can duplicate or skip facilities near a page boundary. Amenities and live availability hints remain outside this core step until their own models exist, so the broader Phase 5 checklist item stays open rather than pretending those fields are implemented.

## Build authentication and Super Admin SMS APIs

- **What was done:** Added resident OTP/session/refresh routes, Super Admin password-challenge/MFA-session/cookie-refresh routes, session revocation, provider implementation discovery, platform configuration CRUD/revisions, fixed-content test SMS, activation, and deactivation. SMS APIs are backend-only and require authenticated `super_admin_web` role and permission checks.
- **Why:** The future Admin Web App can configure and hot-swap providers without exposing secret values or modifying backend code. Credentials are accepted only on writes; responses contain per-field configured booleans.
- **How it works:** Public authentication routes validate strict Zod DTOs and delegate to the auth service; global access/authentication/permission guards protect everything else. Configuration APIs force platform scope server-side, use immutable revision endpoints for delivery changes, and require a successful fixed-content test before activation. Audit correlation IDs are carried from HTTP middleware into configuration transactions.
- **Key concepts:** Public-route allowlists; three-part privileged authorization (client, role, permission); write-only secret APIs; resource revision endpoints; test-before-activate lifecycle; sanitized service-unavailable errors.
- **Best practices applied:** All mutations use non-GET verbs, IDs and E.164 destinations are validated, credentials/provider responses never appear in responses, and real HTTP integration tests exercise the same Nest modules, PostgreSQL, and Redis used in production. OpenAPI generation includes all 17 routes.
- **Mistakes to avoid:** Letting callers set `scopeType`/`scopeId`; returning encrypted payloads as if ciphertext were harmless; using a user-selected test message; marking a revision tested after a failed provider result; or registering the development inbox outside development. The inbox is omitted from the Nest module outside development, while mock delivery remains usable in tests only.

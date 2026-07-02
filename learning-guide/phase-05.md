# Phase 5 — APIs — Learning Guide

Append-only build log entries for Phase 05 checklist items. New entries go at the bottom.

## Build facility discovery API core

- **What was done:** Added public `GET /v1/facilities` and `GET /v1/facilities/{facilityId}` routes with strict Zod query/parameter validation, active-record filtering, text and facility-type filters, optional radius-bounded PostGIS search, deterministic keyset pagination, public response mapping, and concrete OpenAPI response schemas. Nearby cursors retain the exact database distance while the response rounds meters for clients, and every cursor carries a canonical query key so changing filters invalidates it instead of silently continuing a different result set.

- **Why and verification:** This is the next runnable step in the resident-to-check-in vertical slice and uses the facility schema plus pagination foundation against a real consumer. Tests cover partial-coordinate rejection, malformed IDs, public auth allowlisting, filtered pages, cursor replay rejection, inactive-resource hiding, `ST_DWithin` radius behavior, distance ordering, and keyset continuation; 160 unit/E2E tests and 26 PostGIS integration tests pass alongside typecheck, lint, build, and OpenAPI generation.

- **Non-obvious gotcha:** `ST_Distance` must remain unrounded inside the cursor because comparing a rounded continuation value against the exact SQL sort expression can duplicate or skip facilities near a page boundary. Amenities and live availability hints remain outside this core step until their own models exist, so the broader Phase 5 checklist item stays open rather than pretending those fields are implemented.

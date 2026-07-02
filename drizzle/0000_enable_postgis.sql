-- Enable the PostGIS extension in the application database.
-- This must run before any spatial column or index is created.
-- See DECISIONS.md → "PostgreSQL + PostGIS provisioning".
CREATE EXTENSION IF NOT EXISTS postgis;
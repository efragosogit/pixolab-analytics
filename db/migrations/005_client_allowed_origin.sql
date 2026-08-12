-- Per-client CORS origin for the new per-client leads ingest route
-- (app/api/leads/ingest/[client]/route.ts). Public, non-secret info (a
-- client's own website domain), so it lives in `clients` alongside the
-- other identity fields, not as an env var — consistent with the
-- identity-in-DB / credentials-in-env split from 004_multi_tenant.sql.
-- Run once: psql "$DATABASE_URL" -f db/migrations/005_client_allowed_origin.sql

ALTER TABLE clients ADD COLUMN IF NOT EXISTS allowed_origin TEXT;

UPDATE clients SET allowed_origin = 'https://lumiservicios.com' WHERE slug = 'lumiservicios';

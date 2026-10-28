-- Per-client settings stored in the DB instead of `CLIENT_<SLUG>_*` env
-- vars, so a new dashboard can be created and connected from the app
-- itself (the "Agregar nuevo dashboard" wizard + each dashboard's
-- Configuración page) without editing Coolify and redeploying.
-- Run once: psql "$DATABASE_URL" -f db/migrations/006_client_settings.sql
--
-- Three things happen here:
-- 1. `clients.is_draft` — a dashboard created from the wizard starts as a
--    draft: only @pixolab.com.mx staff can see/open it until someone
--    publishes it from Configuración. Existing clients are not drafts.
-- 2. `client_integrations` — one row per (client, integration). Non-secret
--    fields (project id, GSC site URL, Ads customer id, ...) live in
--    `config` as plain JSON; secret fields (the OpenPanel client secret,
--    the per-client leads ingest secret) live ONLY in `secret_ciphertext`,
--    AES-256-GCM encrypted by the app (lib/secrets.ts) with the
--    CONFIG_ENCRYPTION_KEY env var — a DB dump alone can't read them.
--    `last_test_*` records the most recent "Probar conexión" result.
-- 3. `client_conversions` — what counts as a lead for each client, which
--    used to be hardcoded for Lumiservicios in the Funnels/Leads pages and
--    the ingest webhook:
--      kind 'event' → an OpenPanel event name (e.g. whatsapp_click),
--                     counted as unique people who fired it.
--      kind 'form'  → a lead source posted to /ingest/leads/{client}
--                     (e.g. form_submitted), stored in `leads.source`,
--                     with the page the form lives on (page_path).
--    `key` is the event name / `leads.source` value; `label` is what the
--    UI shows.

-- 1. Draft dashboards ---------------------------------------------------

ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by TEXT;

-- 2. Integrations -------------------------------------------------------

CREATE TABLE IF NOT EXISTS client_integrations (
  client TEXT NOT NULL REFERENCES clients (slug) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('openpanel', 'gsc', 'google_ads', 'leads')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  secret_ciphertext TEXT,
  last_test_ok BOOLEAN,
  last_test_message TEXT,
  last_tested_at TIMESTAMPTZ,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client, kind)
);

-- 3. Conversions --------------------------------------------------------

CREATE TABLE IF NOT EXISTS client_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client TEXT NOT NULL REFERENCES clients (slug) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('event', 'form')),
  key TEXT NOT NULL CHECK (key ~ '^[a-z0-9_]{1,60}$'),
  label TEXT NOT NULL,
  page_path TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client, key)
);

CREATE INDEX IF NOT EXISTS client_conversions_client_idx ON client_conversions (client);

-- Lumiservicios' conversions, exactly what the pages had hardcoded before
-- this migration. Its integration credentials are NOT inserted here (they
-- must be encrypted by the app) — run scripts/seed-client-integrations.mjs
-- for that; until then lib/client-config.ts falls back to the env vars.
INSERT INTO client_conversions (client, kind, key, label, page_path, sort_order) VALUES
  ('lumiservicios', 'event', 'whatsapp_click', 'WhatsApp', NULL, 0),
  ('lumiservicios', 'form', 'form_submitted', 'Formulario de contacto', '/contactanos', 1),
  ('lumiservicios', 'form', 'catalog_download', 'Descarga de catálogo', '/catalogo-lumi', 2)
ON CONFLICT (client, key) DO NOTHING;

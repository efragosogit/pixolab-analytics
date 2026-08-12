-- Leads table — shared across every Pixolab Dashboards client project
-- (see pixolab-server/docs/todo-pixolab-dashboards-db.md), not just
-- Lumiservicios. Tenancy is a plain `client` column, not a schema or
-- database per client — see that file for why.
--
-- Run this by hand once the `pixolab_dashboards` database exists and
-- DATABASE_URL is set:
--   psql "$DATABASE_URL" -f db/migrations/001_leads.sql
-- There's no migration runner wired up yet (one table, not worth a tool
-- like Prisma/Drizzle Kit yet) — if a second migration is ever needed,
-- that's the moment to reconsider adding one.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client TEXT NOT NULL,                 -- e.g. 'lumiservicios' — tenant column
  source TEXT NOT NULL,                 -- 'form_submitted' | 'catalog_download', matches the OpenPanel event name that fired alongside it
  name TEXT,
  email TEXT,
  phone TEXT,
  message TEXT,
  page_path TEXT,                       -- e.g. '/contactanos'
  form_id TEXT,                         -- CF7 form id, for debugging which WP form
  raw JSONB NOT NULL DEFAULT '{}'::jsonb, -- full original payload, in case a field wasn't modeled above
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_client_idx ON leads (client);
CREATE INDEX IF NOT EXISTS leads_client_created_at_idx ON leads (client, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_source_idx ON leads (source);

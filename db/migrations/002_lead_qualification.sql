-- Human qualification of a lead — a salesperson rates it after contact.
-- Run once: psql "$DATABASE_URL" -f db/migrations/002_lead_qualification.sql
--
-- quality_rating is a controlled 1-5 scale (not open text), so it can be
-- averaged/trended over time, not just tallied as a distribution:
--   1 Descartado, 2 Frío, 3 Tibio, 4 Caliente, 5 Muy caliente
-- The CHECK constraint keeps that meaning stable even if the app-layer
-- validation is ever bypassed (a direct psql UPDATE, a future script).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS quality_rating SMALLINT CHECK (quality_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS qualifier_notes TEXT,
  ADD COLUMN IF NOT EXISTS qualified_by TEXT,
  ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS leads_quality_rating_idx ON leads (quality_rating);

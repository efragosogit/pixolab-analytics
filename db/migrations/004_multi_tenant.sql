-- Multi-tenant redesign: one shared frontend serving N client dashboards
-- (analytics.pixolab.com.mx/{client}/...) instead of one deployment per
-- client. Run once: psql "$DATABASE_URL" -f db/migrations/004_multi_tenant.sql
--
-- Two things happen here:
-- 1. A `clients` registry — the canonical list of tenant slugs, so every
--    `client` column elsewhere (client_memberships.client, leads.client)
--    gets real referential integrity via a FK instead of a hand-maintained
--    string nothing enforces.
-- 2. `users` splits into a global identity table (email + password — a
--    property of the *person*) and a new `client_memberships` join table
--    (which client(s) that person has been granted access to, and whether
--    they've accepted). Before this, `users.client` meant one person could
--    only ever belong to one client dashboard — wrong once the same email
--    might need access to two different clients' dashboards (most likely:
--    a Pixolab staff member, though the auto-access rule below means staff
--    usually won't need an explicit membership row at all).

-- 1. Tenant registry -----------------------------------------------------

CREATE TABLE IF NOT EXISTS clients (
  slug TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  favicon_path TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO clients (slug, display_name, favicon_path)
VALUES ('lumiservicios', 'Lumiservicios', '/lumiservicios-favicon.png')
ON CONFLICT (slug) DO NOTHING;

-- 2. Split users -> global identity + per-client memberships ------------

CREATE TABLE IF NOT EXISTS client_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client TEXT NOT NULL REFERENCES clients (slug),
  invited_by TEXT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client)
);
CREATE INDEX IF NOT EXISTS client_memberships_client_idx ON client_memberships (client);
CREATE INDEX IF NOT EXISTS client_memberships_user_idx ON client_memberships (user_id);

-- Backfill: every existing user had exactly one client (users.client),
-- so this 1:1 migration is safe — turn that row into their first
-- membership.
INSERT INTO client_memberships (user_id, client, invited_by, accepted_at, created_at)
SELECT id, client, invited_by, accepted_at, created_at FROM users
ON CONFLICT (user_id, client) DO NOTHING;

-- An invite token now grants one specific membership, not just "a user" —
-- needed so accept-invite knows which client to mark accepted. Reset
-- tokens stay membership-less (a password reset is global, not
-- client-scoped).
ALTER TABLE auth_tokens
  ADD COLUMN IF NOT EXISTS client_membership_id UUID
    REFERENCES client_memberships (id) ON DELETE CASCADE;

UPDATE auth_tokens at SET client_membership_id = cm.id
FROM client_memberships cm
WHERE at.purpose = 'invite' AND cm.user_id = at.user_id AND at.client_membership_id IS NULL;

ALTER TABLE auth_tokens
  ADD CONSTRAINT auth_tokens_invite_needs_membership
    CHECK (purpose <> 'invite' OR client_membership_id IS NOT NULL);

-- Now that every relationship fact lives in client_memberships, drop it
-- from users — password_hash is the only thing that's genuinely global
-- (a property of the person, not of any one client relationship).
ALTER TABLE users
  DROP COLUMN IF EXISTS client,
  DROP COLUMN IF EXISTS invited_by,
  DROP COLUMN IF EXISTS accepted_at;

-- 3. leads.client gets the same referential integrity as everything else.
-- Safe additive constraint — existing values ('lumiservicios') are
-- already valid against the clients row inserted above.
ALTER TABLE leads
  ADD CONSTRAINT leads_client_fkey FOREIGN KEY (client) REFERENCES clients (slug);

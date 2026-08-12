-- Invite-gated email+password auth for the dashboard's "Compartir" flow.
-- Run once: psql "$DATABASE_URL" -f db/migrations/003_auth.sql
--
-- Design notes:
-- - `users.password_hash` starts NULL — a row is created the moment
--   someone is invited, before they've ever logged in. `accepted_at` NULL
--   means "invited, hasn't finished registration yet" (shown as
--   "Pendiente" in the Compartir modal); once they set a password via
--   /invite/[token] both get filled.
-- - `client` mirrors the `leads` table's tenancy column — this dashboard
--   only ever writes 'lumiservicios' today, but it means a future shared
--   Postgres-backed dashboard for another client doesn't need a schema
--   change, just a different value.
-- - Neither invite/reset tokens nor session tokens are stored raw. The
--   random value goes in the email link / cookie; only its SHA-256 hash
--   is persisted (see lib/auth/tokens.ts, lib/auth/session.ts) — a DB
--   dump alone can't be used to log in as anyone or replay an invite.
-- - Revoking access (the Compartir modal's "Quitar acceso") is a hard
--   DELETE on `users`, cascading to their tokens/sessions — instant
--   logout everywhere, no soft-delete/"disabled" flag to remember to
--   check elsewhere.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  client TEXT NOT NULL DEFAULT 'lumiservicios',
  invited_by TEXT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_id_idx ON auth_tokens (user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

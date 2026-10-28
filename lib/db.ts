/**
 * Postgres connection pool for the shared Pixolab Dashboards database —
 * the `pixolab-analytics-postgres` Coolify resource on the Pixolab-apps
 * server, reached over Coolify's internal Docker network (see
 * _infra/README.md), reused across every table this
 * app owns (leads, auth) and any future client dashboard's tables too —
 * one pool, one DATABASE_URL, tenancy via each table's own `client`
 * column, not a database/schema per client.
 *
 * Server-only. Never import from a Client Component.
 */
import { Pool } from "pg";

let pool: Pool | null = null;

function assertConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "Missing DATABASE_URL — copy .env.local.example to .env.local and fill it in (see _infra/README.md for how the database is hosted and reached).",
    );
  }
}

export function getPool(): Pool {
  assertConfigured();
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    // The production database is only reachable over Coolify's private
    // Docker network, so plain (non-TLS) is the default. Set
    // DATABASE_SSL=true in .env.local if a future setup (e.g. a public
    // proxy in front of Postgres) needs TLS; the cert chain isn't verified.
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

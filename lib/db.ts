/**
 * Postgres connection pool for the shared Pixolab Dashboards database —
 * Railway project "Pixolab Dashboards" (see
 * pixolab-dashboards/_infra/README.md), reused across every table this
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
      "Missing DATABASE_URL — copy .env.local.example to .env.local and fill it in (see pixolab-dashboards/_infra/README.md for the Railway connection details).",
    );
  }
}

export function getPool(): Pool {
  assertConfigured();
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    // Railway's TCP proxy terminates TLS in front of Postgres; the app's
    // own connection to it doesn't need to verify a cert chain. Set
    // DATABASE_SSL=true in .env.local if a future setup needs real TLS.
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

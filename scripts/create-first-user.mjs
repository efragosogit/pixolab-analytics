/**
 * One-off bootstrap: create the very first dashboard user directly in
 * Postgres and print an invite link — sidesteps the chicken-and-egg
 * problem where every other user is invited *by* someone who's already
 * logged in, and also sidesteps needing RESEND_API_KEY configured yet
 * (this prints the link instead of emailing it).
 *
 * Usage:
 *   node --env-file=.env.local scripts/create-first-user.mjs [email]
 *
 * Defaults to efragoso@pixolab.com.mx (the org admin, see CLAUDE.md).
 * Re-running for an email that already accepted its invite is a no-op
 * (prints a message instead of a link) — it won't touch an existing
 * password. Re-running for a still-pending invite issues a fresh token
 * (the old one, if any, is simply superseded — unused tokens don't need
 * cleanup, they just expire).
 *
 * Mirrors the hashing in lib/auth/tokens.ts by hand (sha256 of the raw
 * token) rather than importing the TS module — these scripts run as
 * plain Node ESM, no build step.
 */
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const email = (process.argv[2] ?? "efragoso@pixolab.com.mx").trim().toLowerCase();
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const INVITE_TTL_DAYS = 7;

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL — run with `node --env-file=.env.local ...`");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function generateToken() {
  return randomBytes(32).toString("hex");
}
function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

const existing = await pool.query(
  `SELECT id, accepted_at FROM users WHERE email = $1`,
  [email],
);

let userId;
if (existing.rows[0]) {
  if (existing.rows[0].accepted_at) {
    console.log(`${email} already has an active account — nothing to do.`);
    await pool.end();
    process.exit(0);
  }
  userId = existing.rows[0].id;
  console.log(`${email} already exists as a pending invite — issuing a fresh token.`);
} else {
  const inserted = await pool.query(
    `INSERT INTO users (email, client, invited_by) VALUES ($1, 'lumiservicios', 'bootstrap script') RETURNING id`,
    [email],
  );
  userId = inserted.rows[0].id;
  console.log(`Created user row for ${email}.`);
}

const token = generateToken();
const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
await pool.query(
  `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, 'invite', $3)`,
  [userId, hashToken(token), expiresAt],
);

console.log(`\nInvite link (expires ${expiresAt.toISOString()}):`);
console.log(`${appUrl}/invite/${token}\n`);

await pool.end();

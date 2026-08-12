/**
 * Random bearer tokens for invite links, password-reset links, and session
 * cookies — same pattern for all three (see db/migrations/003_auth.sql):
 * the raw value goes out (URL or cookie), only its SHA-256 hash is ever
 * written to Postgres. A DB dump alone can't be replayed into a working
 * session or an unused invite.
 *
 * Server-only.
 */
import { createHash, randomBytes } from "node:crypto";

/** 32 bytes of randomness, hex-encoded — goes in a URL or a cookie. */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** One-way, deterministic — used both to store and to look up a token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

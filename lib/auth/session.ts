/**
 * Session cookie handling — an opaque random token (see tokens.ts) stored
 * httpOnly, looked up against the `sessions` table on every request that
 * needs to know who's logged in. No JWT, nothing self-encoding: revoking
 * access (Compartir modal → "Quitar acceso") is a plain DB DELETE and the
 * session dies immediately, no waiting for a token to expire client-side.
 *
 * Server-only. Never import from a Client Component.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { SESSION_COOKIE } from "./constants";
import { generateToken, hashToken } from "./tokens";

const SESSION_TTL_DAYS = 30;

/**
 * A session proves "this is user X" — nothing more. Which client
 * dashboard(s) they can reach is resolved per-request from the URL's
 * `client` segment (see `lib/auth/users.ts`'s `hasClientAccess`), not
 * baked into the session, since one person can belong to multiple
 * clients.
 */
export interface SessionUser {
  id: string;
  email: string;
}

/** Creates a session row + sets the cookie. Call after login/invite-accept. */
export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await getPool().query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt],
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Reads the cookie, validates it against the DB, returns the user or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await getPool().query<SessionUser>(
    `SELECT u.id, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
}

/** For Server Components/layouts — bounces to /login instead of returning null. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Deletes the session row (kills it server-side) and clears the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await getPool().query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * User/membership/invite/session business logic backing the login flow
 * and the "Compartir" modal. See `db/migrations/003_auth.sql` +
 * `004_multi_tenant.sql` for the schema this queries directly (no ORM,
 * same style as `lib/leads-db.ts`).
 *
 * Multi-tenant shape: `users` is a global identity (email + password —
 * one person, one password, regardless of how many client dashboards they
 * can reach). `client_memberships` is the join table recording which
 * client(s) a person has been granted access to and whether they've
 * accepted. A person can be invited to multiple clients over time; the
 * second (and later) invite skips the password step entirely — see
 * `acceptInvite`'s fork below — since they already have an account.
 *
 * Server-only. Never import from a Client Component.
 */
import { getPool } from "@/lib/db";
import { type ClientRow, getClientRow, listActiveClients } from "@/lib/client-config";
import { sendInviteEmail, sendResetEmail } from "./email";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "./passwords";
import { generateToken, hashToken } from "./tokens";

const INVITE_TTL_DAYS = 7;
const RESET_TTL_HOURS = 1;

function requireAppUrl(): string {
  const url = process.env.APP_URL;
  if (!url) {
    throw new Error("Missing APP_URL — copy .env.local.example to .env.local and fill it in.");
  }
  return url.replace(/\/$/, "");
}

/**
 * The Compartir modal's only access-control rule: managing *who else* has
 * access (inviting/revoking) is limited to the Pixolab team. This is also
 * the staff auto-access rule — `@pixolab.com.mx` gets every client
 * dashboard without needing an explicit membership row (see
 * `hasClientAccess`/`getAccessibleClients` below); everyone else needs an
 * explicit per-client invite + accepted membership.
 */
export function canManageAccess(email: string): boolean {
  return email.toLowerCase().endsWith("@pixolab.com.mx");
}

/**
 * Does this user have access to this specific client dashboard? Staff
 * pass unconditionally (computed live, never materialized as a row — see
 * the plan's reasoning: pre-creating a membership row per staff member per
 * client just moves the "remember to grant access" footgun elsewhere).
 * Everyone else needs an accepted `client_memberships` row.
 */
export async function hasClientAccess(
  userId: string,
  email: string,
  client: string,
): Promise<boolean> {
  if (canManageAccess(email)) return true;
  const result = await getPool().query(
    `SELECT 1 FROM client_memberships WHERE user_id = $1 AND client = $2 AND accepted_at IS NOT NULL`,
    [userId, client],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Every client dashboard this user can reach — used by the post-login
 * picker (`app/(dashboard)/page.tsx`). Staff get every active client with
 * no membership rows needed; everyone else gets their accepted
 * memberships.
 */
export async function getAccessibleClients(userId: string, email: string): Promise<ClientRow[]> {
  if (canManageAccess(email)) return listActiveClients();

  interface Row {
    slug: string;
    display_name: string;
    favicon_path: string | null;
    active: boolean;
    allowed_origin: string | null;
  }
  const result = await getPool().query<Row>(
    `SELECT c.slug, c.display_name, c.favicon_path, c.active, c.allowed_origin
     FROM client_memberships cm
     JOIN clients c ON c.slug = cm.client
     WHERE cm.user_id = $1 AND cm.accepted_at IS NOT NULL AND c.active
     ORDER BY c.display_name ASC`,
    [userId],
  );
  return result.rows.map((r) => ({
    slug: r.slug,
    displayName: r.display_name,
    faviconPath: r.favicon_path,
    active: r.active,
    allowedOrigin: r.allowed_origin,
  }));
}

export interface Collaborator {
  id: string;
  email: string;
  invitedBy: string | null;
  status: "pending" | "active";
  createdAt: string;
}

/**
 * Who's been explicitly granted access to this one client — what the
 * Compartir modal's list shows. Staff members who were never explicitly
 * invited do NOT appear here (nothing to revoke for them — their access
 * comes from their email domain, not a row; the modal shows a static
 * caption instead, see components/share-dialog.tsx).
 */
export async function listCollaborators(client: string): Promise<Collaborator[]> {
  const result = await getPool().query(
    `SELECT u.id, u.email, cm.invited_by, cm.accepted_at, cm.created_at
     FROM client_memberships cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.client = $1
     ORDER BY cm.created_at ASC`,
    [client],
  );
  return result.rows.map((r) => ({
    id: r.id,
    email: r.email,
    invitedBy: r.invited_by,
    status: r.accepted_at ? "active" : "pending",
    createdAt: r.created_at,
  }));
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function inviteUser(
  email: string,
  invitedBy: string,
  client: string,
): Promise<ActionResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    return { ok: false, error: "Correo inválido." };
  }

  const pool = getPool();

  // Find-or-create the global identity first (this email may already have
  // an account via a different client's invite).
  const existingUser = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
    normalizedEmail,
  ]);
  const userId =
    existingUser.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(`INSERT INTO users (email) VALUES ($1) RETURNING id`, [
        normalizedEmail,
      ])
    ).rows[0].id;

  // Then find-or-create the membership for THIS client — the UNIQUE
  // (user_id, client) constraint is what "already invited to this client"
  // actually means now, not anything about the user row.
  const existingMembership = await pool.query<{ id: string; accepted_at: string | null }>(
    `SELECT id, accepted_at FROM client_memberships WHERE user_id = $1 AND client = $2`,
    [userId, client],
  );

  let membershipId: string;
  if (existingMembership.rows[0]) {
    if (existingMembership.rows[0].accepted_at) {
      return { ok: false, error: "Esta persona ya tiene acceso." };
    }
    // Re-invite: reuse the pending row, just issue a fresh token/email.
    membershipId = existingMembership.rows[0].id;
  } else {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO client_memberships (user_id, client, invited_by) VALUES ($1, $2, $3) RETURNING id`,
      [userId, client, invitedBy],
    );
    membershipId = inserted.rows[0].id;
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at, client_membership_id)
     VALUES ($1, $2, 'invite', $3, $4)`,
    [userId, hashToken(token), expiresAt, membershipId],
  );

  const clientRow = await getClientRow(client);
  await sendInviteEmail(
    normalizedEmail,
    `${requireAppUrl()}/invite/${token}`,
    invitedBy,
    clientRow?.displayName ?? client,
  );
  return { ok: true };
}

/**
 * Revokes access to ONE client, not the whole account — the user's global
 * identity (and any other clients they belong to) is untouched. Hard
 * DELETE on the membership row cascades to any still-unused invite tokens
 * tied to it; sessions aren't client-scoped so a revoke doesn't log the
 * person out of a *different* client they still have access to.
 */
export async function revokeMembership(userId: string, client: string): Promise<void> {
  await getPool().query(`DELETE FROM client_memberships WHERE user_id = $1 AND client = $2`, [
    userId,
    client,
  ]);
}

/**
 * Read-only look-up for the invite/reset pages' initial render. For an
 * invite token, also reports which client it grants and whether the
 * target user already has a password — the invite page uses `hasPassword`
 * to pick between the full "set your password" form (first-ever invite)
 * and a simple "Aceptar acceso" confirmation (already has an account via
 * another client). Consuming the token happens only in
 * `acceptInvite`/`resetPassword`, on submit — this never marks it used.
 */
export async function peekAuthToken(
  token: string,
  purpose: "invite" | "reset",
): Promise<{ email: string; client: string | null; hasPassword: boolean } | null> {
  const result = await getPool().query<{
    email: string;
    client: string | null;
    has_password: boolean;
  }>(
    `SELECT u.email, cm.client, (u.password_hash IS NOT NULL) AS has_password
     FROM auth_tokens at
     JOIN users u ON u.id = at.user_id
     LEFT JOIN client_memberships cm ON cm.id = at.client_membership_id
     WHERE at.token_hash = $1 AND at.purpose = $2 AND at.used_at IS NULL AND at.expires_at > now()`,
    [hashToken(token), purpose],
  );
  const row = result.rows[0];
  return row ? { email: row.email, client: row.client, hasPassword: row.has_password } : null;
}

export interface ConsumeTokenResult extends ActionResult {
  userId?: string;
  client?: string;
}

/**
 * `password` is required only the first time a person accepts ANY
 * invite — pass `null` when the invite page rendered the "already have an
 * account, just confirm" branch (see `peekAuthToken`'s `hasPassword`).
 */
export async function acceptInvite(
  token: string,
  password: string | null,
): Promise<ConsumeTokenResult> {
  const pool = getPool();
  const tokenRow = await pool.query<{
    id: string;
    user_id: string;
    client_membership_id: string;
    client: string;
    password_hash: string | null;
  }>(
    `SELECT at.id, at.user_id, at.client_membership_id, cm.client, u.password_hash
     FROM auth_tokens at
     JOIN users u ON u.id = at.user_id
     JOIN client_memberships cm ON cm.id = at.client_membership_id
     WHERE at.token_hash = $1 AND at.purpose = 'invite' AND at.used_at IS NULL AND at.expires_at > now()`,
    [hashToken(token)],
  );
  const row = tokenRow.rows[0];
  if (!row) return { ok: false, error: "Este enlace de invitación ya no es válido o expiró." };

  if (row.password_hash === null) {
    // First-ever invite for this person — a password is required.
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
    }
    const passwordHash = await hashPassword(password);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
      passwordHash,
      row.user_id,
    ]);
  }
  // Else: already has an account (accepted an invite to a different
  // client before) — just grant this membership, no password re-entry.
  // A valid unexpired token is already the authentication event here,
  // same trust model as the first-time case.

  await pool.query(`UPDATE client_memberships SET accepted_at = now() WHERE id = $1`, [
    row.client_membership_id,
  ]);
  await pool.query(`UPDATE auth_tokens SET used_at = now() WHERE id = $1`, [row.id]);

  return { ok: true, userId: row.user_id, client: row.client };
}

export interface LoginResult extends ActionResult {
  userId?: string;
}

export async function verifyCredentials(email: string, password: string): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await getPool().query<{ id: string; password_hash: string | null }>(
    `SELECT id, password_hash FROM users WHERE email = $1`,
    [normalizedEmail],
  );
  const row = result.rows[0];
  // Same generic message whether the email doesn't exist, is still
  // pending (no password set yet), or the password is wrong — don't leak
  // which case it was.
  if (!row?.password_hash) return { ok: false, error: "Correo o contraseña incorrectos." };

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return { ok: false, error: "Correo o contraseña incorrectos." };
  return { ok: true, userId: row.id };
}

/** Always succeeds from the caller's point of view — never reveals whether the email exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const pool = getPool();
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 AND password_hash IS NOT NULL`,
    [normalizedEmail],
  );
  const row = result.rows[0];
  if (!row) return;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, 'reset', $3)`,
    [row.id, hashToken(token), expiresAt],
  );
  await sendResetEmail(normalizedEmail, `${requireAppUrl()}/reset-password/${token}`);
}

export async function resetPassword(token: string, password: string): Promise<ConsumeTokenResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }

  const pool = getPool();
  const tokenRow = await pool.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM auth_tokens
     WHERE token_hash = $1 AND purpose = 'reset' AND used_at IS NULL AND expires_at > now()`,
    [hashToken(token)],
  );
  const row = tokenRow.rows[0];
  if (!row) return { ok: false, error: "Este enlace ya no es válido o expiró." };

  const passwordHash = await hashPassword(password);
  await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, row.user_id]);
  await pool.query(`UPDATE auth_tokens SET used_at = now() WHERE id = $1`, [row.id]);
  // A password reset kills every other active session — force re-login
  // everywhere, not just on the device that requested the reset.
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [row.user_id]);

  return { ok: true, userId: row.user_id };
}

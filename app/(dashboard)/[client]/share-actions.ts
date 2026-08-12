"use server";

import { requireUser } from "@/lib/auth/session";
import {
  canManageAccess,
  inviteUser,
  listCollaborators,
  revokeMembership,
  type Collaborator,
} from "@/lib/auth/users";

export interface ShareActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Deliberately does NOT call revalidatePath — app/(dashboard)/[client]/layout.tsx
 * is `force-dynamic`, so a real navigation always re-fetches
 * `listCollaborators()` fresh regardless of cache. Calling
 * `revalidatePath(..., "layout")` here was tried first and had a bad side
 * effect: it made Next re-render the whole layout subtree for the
 * *currently open* page, which remounted this Dialog's client-side
 * instance and silently reset it (closed, error message lost, input
 * cleared) — right after a successful mutation, invisible to the user.
 * Instead, `ShareDialog` refetches its own list via
 * `getCollaboratorsAction` below after invite/revoke, entirely
 * client-driven, no server-triggered remount involved. Do NOT reintroduce
 * revalidatePath here when touching this file — same trap applies now
 * that it's per-client, nothing about the client segment changes the
 * reasoning.
 *
 * `client` is passed explicitly from the client component (sourced from
 * `[client]/layout.tsx`'s already-validated `params`, threaded down
 * through `Topbar` — never independently re-derived via `useParams()`
 * inside `ShareDialog`, so there's exactly one source of truth for "which
 * client" per render). Every action still independently re-checks
 * `requireUser()` + `canManageAccess()` before trusting it — a
 * forged/typo'd slug is also rejected by Postgres itself on insert, since
 * `client_memberships.client` FKs to `clients.slug`.
 */
export async function getCollaboratorsAction(client: string): Promise<Collaborator[]> {
  await requireUser();
  return listCollaborators(client);
}

export async function inviteCollaboratorAction(
  client: string,
  email: string,
): Promise<ShareActionResult> {
  // requireUser() can call redirect(), which throws a special Next.js
  // signal — kept outside any try/catch below so a generic catch doesn't
  // swallow it and turn a redirect into an error response instead.
  const user = await requireUser();
  if (!canManageAccess(user.email)) {
    return { ok: false, error: "Solo el equipo de Pixolab puede administrar el acceso." };
  }

  try {
    return await inviteUser(email, user.email, client);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function revokeCollaboratorAction(
  client: string,
  userId: string,
): Promise<ShareActionResult> {
  const user = await requireUser();
  if (!canManageAccess(user.email)) {
    return { ok: false, error: "Solo el equipo de Pixolab puede administrar el acceso." };
  }
  if (userId === user.id) {
    return { ok: false, error: "No puedes quitarte tu propio acceso desde aquí." };
  }

  try {
    await revokeMembership(userId, client);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

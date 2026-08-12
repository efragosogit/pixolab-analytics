"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth/session";
import { acceptInvite } from "@/lib/auth/users";

export interface AcceptInviteFormResult {
  ok: boolean;
  error?: string;
}

/**
 * `password` is `null` when the invite page rendered the "already have an
 * account" branch (see `invite-form.tsx`) — that person just confirms,
 * no new password.
 */
export async function acceptInviteAction(
  token: string,
  password: string | null,
): Promise<AcceptInviteFormResult> {
  const result = await acceptInvite(token, password);
  if (!result.ok || !result.userId || !result.client) {
    return { ok: false, error: result.error ?? "No se pudo completar el registro." };
  }
  await createSession(result.userId);
  redirect(`/${result.client}`);
}

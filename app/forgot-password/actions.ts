"use server";

import { requestPasswordReset } from "@/lib/auth/users";

/** Always resolves the same way — never reveals whether the email exists. */
export async function requestPasswordResetAction(email: string): Promise<{ ok: true }> {
  await requestPasswordReset(email);
  return { ok: true };
}

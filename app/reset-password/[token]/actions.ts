"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth/session";
import { resetPassword } from "@/lib/auth/users";

export interface ResetPasswordFormResult {
  ok: boolean;
  error?: string;
}

export async function resetPasswordAction(
  token: string,
  password: string,
): Promise<ResetPasswordFormResult> {
  const result = await resetPassword(token, password);
  if (!result.ok || !result.userId) {
    return { ok: false, error: result.error ?? "No se pudo restablecer la contraseña." };
  }
  await createSession(result.userId);
  redirect("/");
}

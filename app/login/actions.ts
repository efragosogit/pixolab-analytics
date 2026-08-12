"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth/session";
import { verifyCredentials } from "@/lib/auth/users";

export interface LoginFormResult {
  ok: boolean;
  error?: string;
}

export async function loginAction(email: string, password: string): Promise<LoginFormResult> {
  const result = await verifyCredentials(email, password);
  if (!result.ok || !result.userId) {
    return { ok: false, error: result.error ?? "Correo o contraseña incorrectos." };
  }
  await createSession(result.userId);
  redirect("/");
}

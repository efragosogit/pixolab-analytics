"use client";

import { useState, useTransition } from "react";
import { acceptInviteAction } from "./actions";
import { AuthFieldLabel } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Two branches, one component: `hasPassword` is true when this email
 * already accepted a *different* client's invite before (a global
 * `users.password_hash` already exists) — that person just confirms
 * access to this new client, no password re-entry (a valid unexpired
 * token is already the authentication event, same trust model as the
 * first-time case). `hasPassword: false` is today's original flow: set a
 * password to create the account.
 */
export function InviteForm({
  token,
  email,
  clientDisplayName,
  hasPassword,
}: {
  token: string;
  email: string;
  clientDisplayName: string;
  hasPassword: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasPassword && password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await acceptInviteAction(token, hasPassword ? null : password);
      if (!result.ok) setError(result.error ?? "No se pudo completar el registro.");
    });
  }

  if (hasPassword) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-foreground/80">
          Ya tienes una cuenta ({email}) — solo falta confirmar tu acceso al dashboard de{" "}
          <strong>{clientDisplayName}</strong>.
        </p>
        {error && <p className="text-xs text-status-critical">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Confirmando…" : `Aceptar acceso a ${clientDisplayName}`}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <AuthFieldLabel>Correo</AuthFieldLabel>
        <Input value={email} disabled readOnly />
      </div>
      <div>
        <AuthFieldLabel>Contraseña</AuthFieldLabel>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div>
        <AuthFieldLabel>Confirmar contraseña</AuthFieldLabel>
        <Input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {error && <p className="text-xs text-status-critical">{error}</p>}

      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Creando cuenta…" : "Crear mi cuenta"}
      </Button>
    </form>
  );
}

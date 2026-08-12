"use client";

import { useState, useTransition } from "react";
import { resetPasswordAction } from "./actions";
import { AuthFieldLabel } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resetPasswordAction(token, password);
      if (!result.ok) setError(result.error ?? "No se pudo restablecer la contraseña.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <AuthFieldLabel>Nueva contraseña</AuthFieldLabel>
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
        {pending ? "Guardando…" : "Restablecer contraseña"}
      </Button>
    </form>
  );
}

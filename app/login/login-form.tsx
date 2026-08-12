"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { loginAction } from "./actions";
import { AuthFieldLabel } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await loginAction(email, password);
      // On success the action redirects and never resolves here.
      if (!result.ok) setError(result.error ?? "Correo o contraseña incorrectos.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <AuthFieldLabel>Correo</AuthFieldLabel>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          autoComplete="email"
          required
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <AuthFieldLabel>Contraseña</AuthFieldLabel>
          <Link href="/forgot-password" className="text-xs text-primary hover:underline">
            ¿La olvidaste?
          </Link>
        </div>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      {error && <p className="text-xs text-status-critical">{error}</p>}

      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}

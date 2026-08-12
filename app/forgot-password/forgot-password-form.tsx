"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestPasswordResetAction } from "./actions";
import { AuthFieldLabel } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await requestPasswordResetAction(email);
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground/80">
          Si <strong>{email}</strong> tiene una cuenta, te llegará un correo con instrucciones
          para restablecer tu contraseña. El enlace expira en 1 hora.
        </p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      </div>
    );
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
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Enviando…" : "Enviar enlace de restablecimiento"}
      </Button>
      <Link href="/login" className="text-center text-sm text-primary hover:underline">
        Volver a iniciar sesión
      </Link>
    </form>
  );
}

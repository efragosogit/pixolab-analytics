import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { peekAuthToken } from "@/lib/auth/users";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reset = await peekAuthToken(token, "reset");

  if (!reset) {
    return (
      <AuthCard title="Enlace no válido">
        <p className="text-sm text-muted-foreground">
          Este enlace para restablecer tu contraseña ya no es válido — puede que ya lo hayas
          usado o que haya expirado (dura 1 hora). Pide uno nuevo desde la pantalla de inicio de
          sesión.
        </p>
        <Link href="/forgot-password" className="mt-4 block text-sm text-primary hover:underline">
          Pedir un enlace nuevo
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Nueva contraseña" description={reset.email}>
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}

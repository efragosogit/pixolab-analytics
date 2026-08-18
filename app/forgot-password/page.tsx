import { AuthCard } from "@/components/auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Restablecer contraseña"
      description="Te mandamos un enlace para elegir una nueva."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}

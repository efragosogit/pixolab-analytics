import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <AuthCard title="Iniciar sesión" description="Dashboard de Lumiservicios">
      <LoginForm />
    </AuthCard>
  );
}

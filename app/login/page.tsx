import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <AuthCard title="Bienvenido de vuelta" description="Inicia sesión para ver tus dashboards.">
      <LoginForm />
    </AuthCard>
  );
}

import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { getClientRow } from "@/lib/client-config";
import { peekAuthToken } from "@/lib/auth/users";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await peekAuthToken(token, "invite");

  if (!invite || !invite.client) {
    return (
      <AuthCard title="Invitación no válida">
        <p className="text-sm text-muted-foreground">
          Este enlace de invitación ya no es válido — puede que ya lo hayas usado o que haya
          expirado (los enlaces duran 7 días). Pide a quien te invitó que te mande uno nuevo.
        </p>
        <Link href="/login" className="mt-4 block text-sm text-primary hover:underline">
          Ir a iniciar sesión
        </Link>
      </AuthCard>
    );
  }

  const clientRow = await getClientRow(invite.client);
  const clientDisplayName = clientRow?.displayName ?? invite.client;

  return (
    <AuthCard
      title={invite.hasPassword ? "Confirmar acceso" : "Crea tu cuenta"}
      description={`Acceso al dashboard de ${clientDisplayName}`}
      logoSrc={clientRow?.faviconPath}
      logoAlt={clientDisplayName}
    >
      <InviteForm
        token={token}
        email={invite.email}
        clientDisplayName={clientDisplayName}
        hasPassword={invite.hasPassword}
      />
    </AuthCard>
  );
}

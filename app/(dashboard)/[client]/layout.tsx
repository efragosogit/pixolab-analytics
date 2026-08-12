import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { requireUser } from "@/lib/auth/session";
import { canManageAccess, hasClientAccess, listCollaborators } from "@/lib/auth/users";
import { getClientRow } from "@/lib/client-config";
import { AuthCard } from "@/components/auth-card";

export const dynamic = "force-dynamic";

/**
 * Everything under this segment requires a real, DB-validated session
 * (`requireUser()`) AND access to THIS specific client (`hasClientAccess`
 * — staff pass automatically, everyone else needs an accepted
 * `client_memberships` row). middleware.ts already bounced
 * obviously-logged-out requests (no cookie at all) before this ever runs;
 * this is the check that actually matters.
 *
 * /login, /invite/[token], /forgot-password, /reset-password/[token] live
 * outside `(dashboard)` entirely on purpose — they render without the
 * Topbar/nav and must be reachable while logged out. The flat
 * `app/(dashboard)/page.tsx` (no `[client]` segment) is the post-login
 * picker — it has its own minimal layout, not this one.
 */
export default async function ClientDashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ client: string }>;
}) {
  const { client } = await params;
  const user = await requireUser();

  const clientRow = await getClientRow(client);
  if (!clientRow || !clientRow.active) notFound();

  const allowed = await hasClientAccess(user.id, user.email, client);
  if (!allowed) {
    return (
      <AuthCard title="Sin acceso">
        <p className="text-sm text-muted-foreground">
          Tu cuenta ({user.email}) no tiene acceso al dashboard de{" "}
          <strong>{clientRow.displayName}</strong>. Pide a quien administra ese cliente que te
          invite desde el botón Compartir.
        </p>
      </AuthCard>
    );
  }

  const collaborators = await listCollaborators(client);

  return (
    <>
      <Topbar
        client={client}
        clientDisplayName={clientRow.displayName}
        clientFaviconPath={clientRow.faviconPath}
        userEmail={user.email}
        collaborators={collaborators}
        canManageSharing={canManageAccess(user.email)}
        currentUserId={user.id}
      />
      <main
        id="dashboard-report"
        className="relative z-0 flex-1 mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10"
      >
        {children}
      </main>
      <footer className="relative z-0 mx-auto w-full max-w-7xl px-6 py-6 md:px-10 text-xs text-muted-foreground/60 border-t border-border/60">
        {clientRow.displayName} · Dashboard interno · Datos de OpenPanel
        {" · "}
        <span className="tabular">
          {new Date().toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
      </footer>
    </>
  );
}

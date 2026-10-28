import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityIcon, ArrowLeftIcon } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { canManageAccess } from "@/lib/auth/users";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { NewDashboardForm } from "@/components/new-dashboard-form";

export const dynamic = "force-dynamic";

/**
 * "Agregar nuevo dashboard" — step 1 of the wizard, reached from the card
 * on the post-login picker. Staff-only (@pixolab.com.mx; 404 for anyone
 * else). Not under `[client]/` (there's no client yet), so it carries the
 * picker's own minimal header rather than the dashboard Topbar. Every
 * later step runs on the new dashboard's Configuración page in wizard
 * mode — see app/(dashboard)/[client]/configuracion/page.tsx.
 */
export default async function NewDashboardPage() {
  const user = await requireUser();
  if (!canManageAccess(user.email)) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border/60 px-6 py-3.5 md:px-10">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight text-foreground"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ActivityIcon className="size-4" strokeWidth={2.5} />
          </span>
          Pixolab <span className="font-normal text-muted-foreground">Analytics</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu email={user.email} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Dashboards
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Nuevo dashboard
          </h1>
          <p className="mt-1.5 mb-8 text-sm text-muted-foreground">
            Empieza con los datos básicos. Después el asistente te guía para conectar OpenPanel,
            Search Console, Google Ads y los leads — cada paso se puede dejar para después. Queda en
            borrador, visible solo para Pixolab, hasta que lo publiques.
          </p>
          <NewDashboardForm />
        </div>
      </main>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboardIcon } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getAccessibleClients } from "@/lib/auth/users";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

export const dynamic = "force-dynamic";

/**
 * Post-login router — NOT under `[client]/`, so it has no Topbar/SectionNav
 * (there's no client context yet, that's the whole point of this page).
 * Exactly one accessible client → skip straight there. Multiple (every
 * @pixolab.com.mx staff member, who gets every active client
 * automatically — see `lib/auth/users.ts`'s `getAccessibleClients`) → a
 * lightweight picker. Zero → a clear "no access yet" state instead of a
 * dead end.
 */
export default async function ClientPickerPage() {
  const user = await requireUser();
  const clients = await getAccessibleClients(user.id, user.email);

  if (clients.length === 1) {
    redirect(`/${clients[0]!.slug}`);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border/60 px-6 py-3.5 md:px-10">
        <span className="text-lg font-semibold leading-none tracking-tight text-foreground">
          Pixolab Dashboards
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu email={user.email} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-12">
        {clients.length === 0 ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-foreground">Sin acceso todavía</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tu cuenta ({user.email}) no tiene acceso a ningún dashboard todavía. Contacta a
              quien te invitó para que te dé acceso.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mb-6 text-lg font-semibold text-foreground">Elige un dashboard</h1>
            <div className="grid gap-3 sm:grid-cols-2">
              {clients.map((c) => (
                <Link
                  key={c.slug}
                  href={`/${c.slug}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/40"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/15">
                    {c.faviconPath ? (
                      <Image
                        src={c.faviconPath}
                        alt={c.displayName}
                        width={36}
                        height={36}
                        className="size-full object-cover"
                      />
                    ) : (
                      <LayoutDashboardIcon className="size-5 text-primary" strokeWidth={2} />
                    )}
                  </span>
                  <span className="font-medium text-foreground">{c.displayName}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

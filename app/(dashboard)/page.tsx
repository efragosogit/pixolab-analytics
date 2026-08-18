import Image from "next/image";
import Link from "next/link";
import { ActivityIcon, ArrowRightIcon, LayoutDashboardIcon } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getAccessibleClients } from "@/lib/auth/users";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

export const dynamic = "force-dynamic";

function friendlyDomain(origin: string | null): string | null {
  if (!origin) return null;
  return origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Post-login router — NOT under `[client]/`, so it has no Topbar/SectionNav
 * (there's no client context yet, that's the whole point of this page).
 *
 * Always shows the picker, even with exactly one accessible client —
 * changed 2026-08-18 from the earlier "skip straight there" behavior per
 * explicit request: every login should land here first, so "which
 * dashboard am I in" is never implicit. @pixolab.com.mx staff get every
 * active client automatically (see `lib/auth/users.ts`'s
 * `getAccessibleClients`), so for them this is genuinely a choice, not
 * just ceremony. Zero accessible clients → a clear "no access yet" state
 * instead of a dead end.
 */
export default async function ClientPickerPage() {
  const user = await requireUser();
  const clients = await getAccessibleClients(user.id, user.email);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border/60 px-6 py-3.5 md:px-10">
        <span className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight text-foreground">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ActivityIcon className="size-4" strokeWidth={2.5} />
          </span>
          Pixolab <span className="font-normal text-muted-foreground">Analytics</span>
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu email={user.email} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        {clients.length === 0 ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 text-center duration-300">
            <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
              <LayoutDashboardIcon className="size-5 text-muted-foreground" strokeWidth={2} />
            </span>
            <h1 className="text-lg font-semibold text-foreground">Sin acceso todavía</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Tu cuenta ({user.email}) no tiene acceso a ningún dashboard todavía. Pide a quien te
              invitó que te dé acceso.
            </p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Hola, {user.email.split("@")[0]}
            </h1>
            <p className="mt-1.5 mb-8 text-sm text-muted-foreground">
              {clients.length === 1
                ? "Tienes acceso a un dashboard."
                : `Tienes acceso a ${clients.length} dashboards. Elige uno para empezar.`}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {clients.map((c) => {
                const domain = friendlyDomain(c.allowedOrigin);
                return (
                  <Link
                    key={c.slug}
                    href={`/${c.slug}`}
                    className="group flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-sm ring-1 ring-foreground/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/15">
                      {c.faviconPath ? (
                        <Image
                          src={c.faviconPath}
                          alt={c.displayName}
                          width={40}
                          height={40}
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="text-base font-semibold text-primary">
                          {c.displayName[0]?.toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {c.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {domain ?? "Dashboard de analytics"}
                      </span>
                    </span>
                    <ArrowRightIcon
                      className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-primary group-hover:opacity-100"
                      strokeWidth={2}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

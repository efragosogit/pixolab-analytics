import Image from "next/image";
import { LayoutDashboardIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared shell for every standalone auth page (login, invite, forgot/reset
 * password) — centered card, no Topbar/nav (those pages live outside the
 * `(dashboard)` route group on purpose, see
 * `app/(dashboard)/[client]/layout.tsx`).
 *
 * Most of these pages (login, forgot/reset password) are global — no
 * client context yet, since the same login serves every client dashboard
 * — so the mark defaults to a generic icon, not any one client's favicon.
 * `/invite/[token]` is the one page that already knows which client the
 * invite is for and passes its real favicon/name via `logoSrc`/`logoAlt`.
 */
export function AuthCard({
  title,
  description,
  logoSrc,
  logoAlt,
  children,
}: {
  title: string;
  description?: string;
  logoSrc?: string | null;
  logoAlt?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-primary/15 ring-1 ring-primary/20">
            {logoSrc ? (
              <Image
                src={logoSrc}
                alt={logoAlt ?? ""}
                width={36}
                height={36}
                className="size-full object-cover"
              />
            ) : (
              <LayoutDashboardIcon className="size-5 text-primary" strokeWidth={2} />
            )}
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm ring-1 ring-foreground/5">
          {children}
        </div>
      </div>
    </div>
  );
}

export const AuthFieldLabel = ({ children }: { children: ReactNode }) => (
  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
    {children}
  </span>
);

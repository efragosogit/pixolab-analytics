"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  ActivityIcon,
  MegaphoneIcon,
  SearchIcon,
  Share2Icon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import type { Collaborator } from "@/lib/auth/users";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/date-range-picker";
import { ExportPdfButton } from "@/components/export-pdf-button";
import { ShareDialog } from "@/components/share-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

// Suffixes, not full paths — every real link is `/{client}${suffix}`, the
// client segment threaded in by SectionNav below. Keep this multi-tenant:
// never hardcode a `/lumiservicios` prefix here again.
const SECTIONS = [
  { suffix: "", label: "Tráfico", icon: TrendingUpIcon },
  { suffix: "/performance", label: "Performance", icon: ActivityIcon },
  { suffix: "/conversiones", label: "Conversiones", icon: TargetIcon },
  { suffix: "/leads", label: "Leads", icon: UsersIcon },
  { suffix: "/seo", label: "SEO", icon: SearchIcon },
  { suffix: "/ads", label: "Publicidad", icon: MegaphoneIcon },
  { suffix: "/social", label: "Social", icon: Share2Icon },
];

/**
 * Section links only carry the date-range params (`period` or `from`/
 * `to`) forward, not the whole search string — nothing else lives in the
 * URL today, but if a page-specific param ever gets added, it shouldn't
 * leak into every other page's link.
 */
function SectionNav({ client }: { client: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const basePath = `/${client}`;

  const rangeQuery = (() => {
    const params = new URLSearchParams();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const period = searchParams.get("period");
    if (from && to) {
      params.set("from", from);
      params.set("to", to);
    } else if (period) {
      params.set("period", period);
    }
    return params.toString();
  })();

  return (
    <div className="relative">
      {/* Fades the last tab instead of a hard cut, hinting there's more
          to swipe to on mobile — SECTIONS has 7 entries, more than a
          375px-wide screen fits at once, and the scroll itself was
          already there before but with zero affordance that it existed. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent sm:hidden" />
      <nav className="scrollbar-none -mx-1 flex items-center gap-1 overflow-x-auto px-1">
        {SECTIONS.map((section) => {
          const path = `${basePath}${section.suffix}`;
          const active = section.suffix === "" ? pathname === basePath : pathname.startsWith(path);
          const Icon = section.icon;
          const href = rangeQuery ? `${path}?${rangeQuery}` : path;
          return (
            <Link
              key={section.suffix}
              href={href}
              className={cn(
                "group relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" strokeWidth={2.25} />
              {section.label}
              {active && (
                <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Topbar({
  client,
  clientDisplayName,
  clientFaviconPath,
  userEmail,
  collaborators,
  canManageSharing,
  currentUserId,
}: {
  client: string;
  clientDisplayName: string;
  clientFaviconPath: string | null;
  userEmail: string;
  collaborators: Collaborator[];
  canManageSharing: boolean;
  currentUserId: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 py-3.5 md:px-10">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <Link href={`/${client}`} className="group flex min-w-0 shrink items-center gap-2 sm:gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/15 transition-colors group-hover:bg-primary/25">
              {clientFaviconPath ? (
                <Image
                  src={clientFaviconPath}
                  alt={clientDisplayName}
                  width={32}
                  height={32}
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-sm font-semibold text-primary">
                  {clientDisplayName[0]?.toUpperCase()}
                </span>
              )}
            </span>
            {/* Hidden below sm — the logo alone is the identity anchor
                on a phone-width topbar; there wasn't room for both a full
                wordmark and every action button, and the actions (date
                range, share, export, account) are what someone actually
                came to tap. The name is one "Cambiar de dashboard" tap
                away via UserMenu if it's ever ambiguous which one this is. */}
            <span className="hidden truncate text-base font-semibold leading-none tracking-tight text-foreground sm:inline sm:text-lg">
              {clientDisplayName}
            </span>
            <span className="hidden shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
              Dashboard
            </span>
          </Link>

          {/*
            Own scrollbar-none overflow-x-auto as a safety net (matching
            SectionNav's pattern below) — the icon-first sizing above
            should already fit every control in the ~320px available on a
            375px-wide phone (verified live: this row alone, unclipped,
            needed 584px against 327px available before these changes,
            forcing the *entire page* to a wider layout viewport — not
            just this row overflowing, everything on the page, including
            fixed-position dialogs, rendered against that wrong width).
            Keeping the scroll fallback means a long future client name or
            an added button degrades to "swipe to see the rest" instead of
            silently breaking the whole page's viewport again.
          */}
          <div className="scrollbar-none flex shrink-0 items-center gap-1 overflow-x-auto sm:gap-2">
            <Suspense fallback={<div className="h-9 w-24 shrink-0 rounded-md bg-card/60 sm:w-40" />}>
              <DateRangePicker />
            </Suspense>
            <ShareDialog
              client={client}
              clientDisplayName={clientDisplayName}
              collaborators={collaborators}
              canManage={canManageSharing}
              currentUserId={currentUserId}
            />
            <ExportPdfButton client={client} clientDisplayName={clientDisplayName} />
            <ThemeToggle />
            <UserMenu email={userEmail} />
          </div>
        </div>

        <Suspense fallback={<div className="h-8 w-full rounded-md bg-card/40" />}>
          <SectionNav client={client} />
        </Suspense>
      </div>
    </header>
  );
}

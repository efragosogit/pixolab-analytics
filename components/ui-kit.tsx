import type { ReactNode } from "react";
import { ArrowDownRightIcon, ArrowUpRightIcon, PlugZapIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card as ShadCard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
          <span className="h-px w-4 bg-primary/60" />
          {eyebrow}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * Universal per-page connection indicator — every page's `PageHeader`
 * should carry one of these so it's always obvious at a glance whether
 * what's on screen is live or simulated. `connected: true` means "this
 * page's data actually comes from a real, working source right now" —
 * for pages with their own try/catch around a real fetch, wire it to
 * `!error` so a broken connection shows red-flagged instead of falsely
 * claiming to be live.
 */
export function SourceStatusBadge({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-status-good/30 bg-status-good/10 px-2.5 py-1 text-[11px] font-medium text-status-good">
        <PlugZapIcon className="size-3" />
        Conectado — datos en vivo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      <SparklesIcon className="size-3" />
      Datos simulados — sin fuente conectada aún
    </span>
  );
}

export function Section({
  title,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ShadCard
      className={cn(
        "border-border/60 bg-card/70 shadow-[0_1px_0_0_rgba(247,243,236,0.03)_inset]",
        className,
      )}
    >
      {title && (
        <CardHeader className="flex-row items-center justify-between px-5 pt-5">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </CardTitle>
          {action}
        </CardHeader>
      )}
      {/*
        Top/bottom spacing lives on CardHeader (pt-5) and here (pb-5, plus
        pt-5 when there's no header) instead of the outer Card's own py —
        that way a caller passing `p-0` (to bleed a table to the card's
        horizontal edges) can't accidentally zero out the title's or the
        content's breathing room from the top/bottom border too.
      */}
      <CardContent className={cn("px-5 pb-5", !title && "pt-5")}>{children}</CardContent>
    </ShadCard>
  );
}

export function StatCard({
  label,
  value,
  delta,
  deltaGoodDirection = "up",
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaGoodDirection?: "up" | "down";
  icon?: ReactNode;
  accent?: boolean;
}) {
  const hasDelta = typeof delta === "number" && !Number.isNaN(delta);
  const isUp = hasDelta && delta! >= 0;
  const isGood = hasDelta && (deltaGoodDirection === "up" ? isUp : !isUp);

  return (
    <ShadCard
      className={cn(
        "relative overflow-hidden border-border/60 bg-card/70 py-5 transition-colors",
        accent && "border-primary/30 bg-gradient-to-br from-primary/10 via-card/70 to-card/70",
      )}
    >
      {accent && (
        <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/20 blur-3xl" />
      )}
      <CardContent className="relative px-5">
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {icon && <span className="text-primary/70">{icon}</span>}
        </div>
        <div className="tabular mt-2 text-[1.9rem] font-semibold leading-none text-foreground">
          {value}
        </div>
        {hasDelta && (
          <div
            className={cn(
              "tabular mt-2.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium",
              isGood ? "text-status-good" : "text-status-critical",
            )}
          >
            {isUp ? (
              <ArrowUpRightIcon className="size-3" />
            ) : (
              <ArrowDownRightIcon className="size-3" />
            )}
            {Math.abs(delta!).toFixed(1)}%
            <span className="font-normal text-muted-foreground">vs. período anterior</span>
          </div>
        )}
      </CardContent>
    </ShadCard>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <ShadCard className="border-status-critical/30 bg-status-critical/5 py-5">
      <CardContent className="px-5">
        <p className="text-sm text-status-critical">
          No se pudieron cargar los datos: {message}
        </p>
      </CardContent>
    </ShadCard>
  );
}

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <ShadCard className="border-dashed border-border py-10">
      <CardContent className="px-5 text-center">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{title}</span> — {note}
        </p>
      </CardContent>
    </ShadCard>
  );
}

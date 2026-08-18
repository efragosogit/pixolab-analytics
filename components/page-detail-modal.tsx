"use client";

import {
  ExternalLinkIcon,
  LinkIcon,
  TimerIcon,
  TrendingDownIcon,
  UsersIcon,
} from "lucide-react";
import type { PagePerformance } from "@/lib/openpanel";
import { getPageInsights, type InsightTone } from "@/lib/page-insights";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const TONE_DOT: Record<InsightTone, string> = {
  critical: "bg-status-critical",
  warning: "bg-status-warning",
  good: "bg-status-good",
  info: "bg-muted-foreground",
};

function bounceTone(rate: number): InsightTone {
  if (rate >= 75) return "critical";
  if (rate >= 55) return "warning";
  return "good";
}

const StatBlock = ({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) => (
  <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
    <span className="flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
      {icon}
      {label}
    </span>
    <span className="tabular text-lg font-semibold leading-none text-foreground">{value}</span>
  </div>
);

/**
 * Shared "resumen esencial" modal for a single page — title, permalink,
 * sessions/bounce/duration for the currently selected range, and a short
 * list of improvement recommendations (see `lib/page-insights.ts`).
 *
 * Triggered from three places (`/performance`'s table,
 * `/conversiones`'s "Páginas que más generan clics", and the home page's
 * "Páginas más visitadas") via `components/clickable-page-bars.tsx` and
 * `components/performance-table.tsx` — both just manage a `selectedPath`
 * string and look the matching `PagePerformance` row up from whatever
 * `/pages/performance` list they already fetched, so this component
 * itself never fetches anything.
 *
 * `page` is `null` when the clicked path wasn't found in that list (a
 * low-traffic page that fell outside the fetched limit) — renders a
 * graceful fallback instead of hiding the modal, so a click always gives
 * *some* response.
 */
export function PageDetailModal({
  page,
  fallbackPath,
  open,
  onOpenChange,
}: {
  page: PagePerformance | null;
  fallbackPath: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!fallbackPath) return null;

  const insights = page ? getPageInsights(page) : [];
  const permalink = page ? `${page.origin}${page.path}` : fallbackPath;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6">{page?.title || fallbackPath}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 overflow-hidden">
            <a
              href={permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1.5 truncate text-primary/80 hover:text-primary hover:underline"
            >
              <LinkIcon className="size-3 shrink-0" />
              <span className="truncate">{permalink}</span>
              <ExternalLinkIcon className="size-3 shrink-0" />
            </a>
          </DialogDescription>
        </DialogHeader>

        {!page ? (
          <p className="text-sm text-muted-foreground">
            No hay suficientes datos de rendimiento para esta página en el rango seleccionado
            (poco tráfico o quedó fuera del límite consultado a OpenPanel).
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatBlock
                label="Visitantes"
                value={page.sessions.toLocaleString("es-MX")}
                icon={<UsersIcon className="size-3" />}
              />
              <StatBlock
                label="Bounce"
                value={`${page.bounce_rate.toFixed(0)}%`}
                icon={<TrendingDownIcon className="size-3" />}
              />
              <StatBlock
                label="Duración"
                value={`${page.avg_duration.toFixed(0)}s`}
                icon={<TimerIcon className="size-3" />}
              />
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">
              Sesiones en el rango seleccionado (OpenPanel) — no es un conteo de personas
              únicas, una misma persona puede aportar más de una sesión.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {page.seo_signals.high_bounce && (
                <Badge
                  variant="outline"
                  className="border-status-critical/40 bg-status-critical/10 text-status-critical"
                >
                  Bounce alto
                </Badge>
              )}
              {page.seo_signals.low_engagement && (
                <Badge
                  variant="outline"
                  className="border-status-warning/40 bg-status-warning/10 text-status-warning"
                >
                  Bajo engagement
                </Badge>
              )}
              {page.seo_signals.good_landing_page && (
                <Badge
                  variant="outline"
                  className="border-status-good/40 bg-status-good/10 text-status-good"
                >
                  Buena landing
                </Badge>
              )}
              <Badge
                variant="outline"
                className={`${
                  bounceTone(page.bounce_rate) === "critical"
                    ? "border-status-critical/40 bg-status-critical/10 text-status-critical"
                    : bounceTone(page.bounce_rate) === "warning"
                      ? "border-status-warning/40 bg-status-warning/10 text-status-warning"
                      : "border-status-good/40 bg-status-good/10 text-status-good"
                }`}
              >
                {page.pageviews.toLocaleString("es-MX")} pageviews
              </Badge>
            </div>

            <div className="flex flex-col gap-2.5 border-t border-border/60 pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recomendaciones
              </span>
              <ul className="flex flex-col gap-2">
                {insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                    <span
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TONE_DOT[insight.tone]}`}
                    />
                    <span className={insight.tone === "info" ? "text-muted-foreground" : "text-foreground/85"}>
                      {insight.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

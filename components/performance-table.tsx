"use client";

import { useState } from "react";
import type { PagePerformance } from "@/lib/openpanel";
import { PageDetailModal } from "@/components/page-detail-modal";
import { Badge } from "@/components/ui/badge";

/**
 * `/performance`'s page-by-page table — extracted from the page itself
 * into a Client Component so a row click can open `PageDetailModal`
 * (Server Components can't hold the open/selected state a modal needs).
 * `pages` is already the exact list rendered here, so every clickable
 * row is guaranteed a match — unlike `ClickablePageBars`, no fallback
 * "not found" case is reachable from this table.
 */
export function PerformanceTable({ pages }: { pages: PagePerformance[] }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selectedPage = pages.find((p) => p.path === selectedPath) ?? null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-3 pl-1 font-medium">Página</th>
            <th className="py-3 text-right font-medium">Sesiones</th>
            <th className="py-3 text-right font-medium">Bounce</th>
            <th className="py-3 text-right font-medium">Duración</th>
            <th className="py-3 pl-4 pr-1 text-left font-medium">Señales</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((p) => (
            <tr
              key={p.path}
              onClick={() => setSelectedPath(p.path)}
              className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-accent/40"
            >
              <td className="max-w-72 py-3 pl-1">
                <div className="truncate font-medium text-foreground">{p.title || p.path}</div>
                <div className="truncate text-xs text-muted-foreground">{p.path}</div>
              </td>
              <td className="tabular py-3 text-right font-medium text-foreground">
                {p.sessions.toLocaleString("es-MX")}
              </td>
              <td className="tabular py-3 text-right">
                <span
                  className={
                    p.bounce_rate >= 75
                      ? "text-status-critical"
                      : p.bounce_rate >= 55
                        ? "text-status-warning"
                        : "text-status-good"
                  }
                >
                  {p.bounce_rate.toFixed(1)}%
                </span>
              </td>
              <td className="tabular py-3 text-right text-foreground/80">
                {p.avg_duration.toFixed(1)}s
              </td>
              <td className="py-3 pl-4 pr-1">
                <div className="flex flex-wrap gap-1">
                  {p.seo_signals.high_bounce && (
                    <Badge
                      variant="outline"
                      className="border-status-critical/40 bg-status-critical/10 text-status-critical"
                    >
                      Bounce alto
                    </Badge>
                  )}
                  {p.seo_signals.low_engagement && (
                    <Badge
                      variant="outline"
                      className="border-status-warning/40 bg-status-warning/10 text-status-warning"
                    >
                      Bajo engagement
                    </Badge>
                  )}
                  {p.seo_signals.good_landing_page && (
                    <Badge
                      variant="outline"
                      className="border-status-good/40 bg-status-good/10 text-status-good"
                    >
                      Buena landing
                    </Badge>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <PageDetailModal
        page={selectedPage}
        fallbackPath={selectedPath}
        open={selectedPath !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPath(null);
        }}
      />
    </div>
  );
}

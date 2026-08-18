"use client";

import { useState } from "react";
import type { PagePerformance } from "@/lib/openpanel";
import { RankedBars, type ValueFormat } from "@/components/charts";
import { PageDetailModal } from "@/components/page-detail-modal";

/**
 * `RankedBars` for pages specifically, wired to open `PageDetailModal` on
 * row click. Used by the home page's "Páginas más visitadas" and
 * `/conversiones`'s "Páginas que más generan clics" — both places rank
 * pages by a metric `/pages/performance` doesn't itself return
 * (pageviews, WhatsApp clicks), so `rows` (what's displayed/ranked) and
 * `pages` (the full `/pages/performance` list, fetched separately by the
 * parent, used only to look up detail for whichever row gets clicked)
 * are deliberately two different inputs — see `PageDetailModal`'s doc
 * comment for what happens when a clicked path isn't in `pages`.
 */
export function ClickablePageBars({
  rows,
  pages,
  format,
  color,
}: {
  rows: { label: string; value: number }[];
  pages: PagePerformance[];
  format?: ValueFormat;
  color?: string;
}) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selectedPage = pages.find((p) => p.path === selectedPath) ?? null;

  return (
    <>
      <RankedBars rows={rows} format={format} color={color} onRowClick={setSelectedPath} />
      <PageDetailModal
        page={selectedPage}
        fallbackPath={selectedPath}
        open={selectedPath !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPath(null);
        }}
      />
    </>
  );
}

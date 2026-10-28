"use client";

import { useMemo, useState } from "react";
import { FileTextIcon, MailIcon, PhoneIcon } from "lucide-react";
import type { LeadDisplay, QualityRating } from "@/lib/leads-types";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableScroll } from "@/components/table-scroll";
import { LeadDetailModal } from "@/components/lead-detail-modal";

// 1 (no apto) is a neutral "not a real prospect" state, not literally
// "worse" than the others in the same sense 2-5 rank against each other —
// styled muted/dashed rather than on the good→critical scale below.
const RATING_STYLE: Record<QualityRating, { label: string; className: string }> = {
  1: { label: "1 · No apto", className: "border-border text-muted-foreground border-dashed" },
  2: {
    label: "2 · Dudoso",
    className: "border-status-critical/40 bg-status-critical/10 text-status-critical",
  },
  3: {
    label: "3 · Tibio",
    className: "border-status-warning/40 bg-status-warning/10 text-status-warning",
  },
  4: { label: "4 · Calificado", className: "border-status-good/40 bg-status-good/10 text-status-good" },
  5: { label: "5 · Excelente", className: "border-status-good bg-status-good/20 text-status-good" },
};

// `lead.date` is a full ISO timestamp (see app/leads/page.tsx's `toLead`) —
// always rendered in Lumiservicios' own timezone regardless of where this
// server/browser happens to run, not the viewer's local zone.
const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

/** "all" or a `leads.source` key. */
type SourceFilter = string;

export function LeadsTable({
  client,
  leads,
  sources,
  qualifierOptions,
}: {
  client: string;
  leads: LeadDisplay[];
  /** The client's form conversions, in display order — one filter tab each. */
  sources: { key: string; label: string }[];
  qualifierOptions: string[];
}) {
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [selected, setSelected] = useState<LeadDisplay | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(
    () => (filter === "all" ? leads : leads.filter((l) => l.sourceKey === filter)),
    [leads, filter],
  );

  // The modal's own state is a snapshot of the lead at click time — after
  // a save, the server component re-fetches and this whole table
  // re-renders with fresh data, so no manual sync needed here.
  function openLead(lead: LeadDisplay) {
    setSelected(lead);
    setModalOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as SourceFilter)}>
        {/* TabsList is `w-fit` (shadcn default) — several Spanish source
            labels together don't fit a phone width, and with nothing to
            scroll them it just silently clipped past the card edge with
            no way to reach the last tab at all. Own scroll container,
            same fix as Topbar's action row. */}
        <div className="scrollbar-none -mx-1 overflow-x-auto px-1">
          <TabsList className="w-max">
            <TabsTrigger value="all">Todas las fuentes</TabsTrigger>
            {sources.map((s) => (
              <TabsTrigger key={s.key} value={s.key}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card py-3 pl-1 font-medium">Prospecto</th>
              <th className="py-3 font-medium">Fuente</th>
              <th className="py-3 font-medium">Detalle</th>
              <th className="py-3 font-medium">Calificación</th>
              <th className="py-3 pr-1 text-right font-medium">Fecha y hora</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Sin leads en este rango.
                </td>
              </tr>
            ) : (
              filtered.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => openLead(lead)}
                  className="group cursor-pointer border-b border-border/40 last:border-0 hover:bg-accent/40"
                >
                  <td className="sticky left-0 z-10 max-w-40 bg-card py-3 pl-1 group-hover:bg-accent/40 sm:max-w-64">
                    <div className="truncate font-medium text-foreground">{lead.name}</div>
                    <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <MailIcon className="size-3 shrink-0" />
                        <span className="truncate">{lead.email}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <PhoneIcon className="size-3 shrink-0" />
                        {lead.phone}
                      </span>
                    </div>
                  </td>
                  <td className="py-3">
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: `color-mix(in oklch, ${lead.sourceColor} 40%, transparent)`,
                        color: lead.sourceColor,
                        backgroundColor: `color-mix(in oklch, ${lead.sourceColor} 10%, transparent)`,
                      }}
                    >
                      {lead.source}
                    </Badge>
                    <div className="mt-1 text-xs text-muted-foreground">{lead.page}</div>
                  </td>
                  <td className="max-w-72 py-3 text-foreground/80">
                    <span className="flex items-start gap-1.5">
                      <FileTextIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                      <span className="line-clamp-2">{lead.detail}</span>
                    </span>
                  </td>
                  <td className="py-3">
                    {lead.qualityRating ? (
                      <Badge variant="outline" className={RATING_STYLE[lead.qualityRating].className}>
                        {RATING_STYLE[lead.qualityRating].label}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin calificar</span>
                    )}
                  </td>
                  <td className="tabular py-3 pr-1 text-right text-muted-foreground">
                    {dateTimeFormatter.format(new Date(lead.date))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableScroll>

      <LeadDetailModal
        client={client}
        lead={selected}
        qualifierOptions={qualifierOptions}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}

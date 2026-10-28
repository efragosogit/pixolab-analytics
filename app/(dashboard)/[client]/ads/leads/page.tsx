import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { MessageCircleIcon, MessageSquareIcon, UsersIcon } from "lucide-react";
import { getLeadsFromDb, type LeadRecord } from "@/lib/leads-db";
import { getQualifierOptions } from "@/lib/auth/users";
import { type Conversion, getClientConfig } from "@/lib/client-config";
import { getUniqueLeadCount } from "@/lib/openpanel";
import { resolveRange } from "@/lib/date-range";
import { ErrorCard, PageHeader, Section, SourceStatusBadge, StatCard } from "@/components/ui-kit";
import { LeadsTable } from "@/components/leads-table";
import { NotConnected } from "@/components/not-connected";
import type { LeadDisplay } from "@/lib/leads-types";

export const dynamic = "force-dynamic";

/** Same order → same color as the Funnels page's "Leads por día" series. */
function seriesColor(index: number) {
  return `var(--chart-${(index % 8) + 1})`;
}

function toLead(record: LeadRecord, conversions: Conversion[]): LeadDisplay {
  const index = conversions.findIndex((c) => c.key === record.source);
  const conversion = index >= 0 ? conversions[index] : undefined;
  return {
    id: record.id,
    name: record.name ?? "(sin nombre)",
    email: record.email ?? "—",
    phone: record.phone ?? "—",
    // A lead whose source isn't (or is no longer) a configured conversion
    // still shows, under its raw key, rather than silently disappearing.
    source: conversion?.label ?? record.source,
    sourceKey: record.source,
    sourceColor: index >= 0 ? seriesColor(index) : "var(--muted-foreground)",
    page: record.pagePath ?? conversion?.pagePath ?? "—",
    date: record.createdAt, // full timestamp, not just the date — see leads-table.tsx's formatting
    detail: record.message ?? "(sin mensaje)",
    qualityRating: record.qualityRating,
    qualifierNotes: record.qualifierNotes,
    qualifiedBy: record.qualifiedBy,
    qualifiedAt: record.qualifiedAt,
  };
}

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await params;
  const range = resolveRange(await searchParams);

  let error: string | null = null;
  let leads: LeadDisplay[] = [];
  let qualifierOptions: string[] = [];
  let conversions: Conversion[] = [];

  try {
    const config = await getClientConfig(client);
    conversions = config.conversions;
    [leads, qualifierOptions] = await Promise.all([
      getLeadsFromDb(client, range).then((rows) => rows.map((r) => toLead(r, conversions))),
      getQualifierOptions(client),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Event conversions (e.g. WhatsApp clicks) live in OpenPanel, not in this
  // page's Postgres `leads` table — there's no name/email/phone for them,
  // only their volume. Kept in its own try/catch, separate from the main
  // leads fetch above: a client with no OpenPanel connected yet should
  // still see its real Postgres leads instead of the whole page erroring
  // out over an unrelated source. Same "unique converting people, not raw
  // click count" definition as the Funnels page, for consistency across
  // the app — see getUniqueLeadCount's doc comment.
  const eventConversions = conversions.filter((c) => c.kind === "event");
  const eventCounts = new Map<string, number | null>();
  try {
    const config = await getClientConfig(client);
    const op = config.openpanel;
    const counts = await Promise.all(
      eventConversions.map((c) => (op ? getUniqueLeadCount(op, range, [c.key]) : null)),
    );
    eventConversions.forEach((c, i) => eventCounts.set(c.key, counts[i] ?? null));
  } catch {
    // leave every event card at "—"
  }

  const formConversions = conversions.filter((c) => c.kind === "form");
  const cardValue = (c: Conversion): number | null =>
    c.kind === "form"
      ? leads.filter((l) => l.sourceKey === c.key).length
      : (eventCounts.get(c.key) ?? null);
  const totalCount = conversions.reduce((sum, c) => sum + (cardValue(c) ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Prospectos"
        title="Leads"
        description={`${format(parseISO(range.startDate), "d MMM", { locale: es })} — ${format(parseISO(range.endDate), "d MMM yyyy", { locale: es })}. Los formularios llegan por el webhook del sitio y guardan nombre, correo y teléfono; las conversiones por evento (como WhatsApp) vienen de OpenPanel y solo aportan volumen — sin acceso al CRM no hay forma de ver esas conversaciones ni de listarlas como prospectos individuales aquí.`}
        action={<SourceStatusBadge connected={!error} />}
      />

      {error ? (
        <ErrorCard message={error} />
      ) : (
        <>
          {conversions.length === 0 ? (
            <NotConnected client={client} integration="conversions" />
          ) : (
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Total de leads"
                value={totalCount.toLocaleString("es-MX")}
                icon={<UsersIcon className="size-4" />}
                accent
              />
              {conversions.map((c) => {
                const value = cardValue(c);
                return (
                  <StatCard
                    key={c.key}
                    label={c.kind === "event" ? `Leads de ${c.label}` : c.label}
                    value={value === null ? "—" : value.toLocaleString("es-MX")}
                    icon={
                      c.kind === "event" ? (
                        <MessageCircleIcon className="size-4" />
                      ) : (
                        <MessageSquareIcon className="size-4" />
                      )
                    }
                  />
                );
              })}
            </section>
          )}

          <Section title="Prospectos">
            <LeadsTable
              client={client}
              leads={leads}
              sources={formConversions.map((c) => ({ key: c.key, label: c.label }))}
              qualifierOptions={qualifierOptions}
            />
          </Section>
        </>
      )}
    </div>
  );
}

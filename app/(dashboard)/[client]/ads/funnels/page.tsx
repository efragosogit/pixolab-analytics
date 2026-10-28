import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ClockIcon, FunnelIcon, TrendingDownIcon } from "lucide-react";
import {
  enumerateDays,
  getDailyEventCounts,
  getEventDetail,
  getFunnel,
  getOverview,
  getPagePerformance,
  getUniqueLeadCount,
  type OpenPanelCreds,
} from "@/lib/openpanel";
import { getAdsOverview, getSeoOverview } from "@/lib/mock-data";
import { getLeadsFromDb } from "@/lib/leads-db";
import { type Conversion, getClientConfig } from "@/lib/client-config";
import { resolveRange, type ResolvedRange } from "@/lib/date-range";
import { ErrorCard, PageHeader, Section, SourceStatusBadge, StatCard } from "@/components/ui-kit";
import { JourneyIndicator, type JourneyStage } from "@/components/journey-indicator";
import { CategoryBars, RankedBars, StackedBars } from "@/components/charts";
import { ClickablePageBars } from "@/components/clickable-page-bars";
import { NotConnected } from "@/components/not-connected";

export const dynamic = "force-dynamic";

/**
 * What counts as a lead comes from each client's `client_conversions` rows
 * (db/migrations/006_client_settings.sql, edited from Configuración) — this
 * page used to hardcode Lumiservicios' three (whatsapp_click,
 * form_submitted → /contactanos, catalog_download → /catalogo-lumi).
 *   kind 'event' → one real OpenPanel session funnel (screen_view → event)
 *                  per conversion, counted as unique people.
 *   kind 'form'  → one 3-stage funnel (visitas → vista de la página del
 *                  formulario → leads registrados), the last stage counted
 *                  from Postgres rows posted by the ingest webhook.
 */
function seriesColor(index: number) {
  return `var(--chart-${(index % 8) + 1})`;
}

interface FunnelStage {
  label: string;
  value: number;
  isHighestDropoff?: boolean;
}

/**
 * Shared bar-funnel visual for every "embudo" on this page. Two flavors
 * feed it: the real per-session OpenPanel `/funnel` result (event
 * conversions — see `EventFunnel`), and a manually-assembled 3-stage flow
 * for form conversions (see `PageFormFunnel`) — `/funnel`'s `steps` only takes
 * plain event names, it can't filter a step to "screen_view on this one
 * path", so those two are stitched together from `/overview` +
 * `/pages/performance` + `/events` instead of a single funnel query.
 */
function StageFunnel({
  title,
  stages,
  overallConversionRate,
  leadsGenerated: leadsGeneratedOverride,
  note,
}: {
  title: string;
  stages: FunnelStage[];
  overallConversionRate: number;
  /**
   * Overrides the "leads generados" headline instead of deriving it from
   * the last stage's value. Only `EventFunnel` uses this — OpenPanel's
   * `/funnel` requires a strict per-session SEQUENCE match (screen_view
   * immediately followed by whatsapp_click within its own funnel window),
   * so its `completedUsers` undercounts vs. a raw unique-people count of
   * whoever fired whatsapp_click at all (e.g. 195 vs. 202 for the same
   * 30-day range) — the funnel's own bars/conversion-rate stay
   * sequence-based (a real, different question: "conversion rate through
   * this exact path"), but the headline "leads generados" number is made
   * to match the Leads page's "Leads de WhatsApp" card, which uses the
   * same raw/unique definition as the rest of this page's lead counting
   * (see `LeadsJourney` and the Leads page's `totalCount`).
   */
  leadsGenerated?: number;
  note?: string;
}) {
  const maxValue = stages[0]?.value ?? 1;
  const leadsGenerated = leadsGeneratedOverride ?? stages[stages.length - 1]?.value ?? 0;

  return (
    <Section
      title={title}
      action={<FunnelIcon className="size-3.5 text-muted-foreground" strokeWidth={2.25} />}
    >
      <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="tabular text-4xl font-semibold text-primary">
            {overallConversionRate.toFixed(2)}%
          </span>
          <span className="text-sm text-muted-foreground">conversión total</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="tabular text-2xl font-semibold text-foreground">
            {leadsGenerated.toLocaleString("es-MX")}
          </span>
          <span className="text-sm text-muted-foreground">leads generados</span>
        </div>
      </div>

      <div className="flex flex-col">
        {stages.map((stage, i) => {
          const widthPct = Math.max((stage.value / maxValue) * 100, 8);
          const rateFromStart = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
          return (
            <div key={stage.label}>
              <div className="flex items-center gap-4">
                <div className="w-6 shrink-0 text-right text-xs text-muted-foreground">
                  {i + 1}
                </div>
                <div className="relative flex h-11 flex-1 items-center overflow-hidden rounded-lg border border-border bg-muted/30">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary/15 transition-all"
                    style={{ width: `${widthPct}%` }}
                  />
                  <div className="relative flex w-full items-center justify-between px-4">
                    <span className="truncate text-sm font-medium text-foreground">
                      {stage.label}
                    </span>
                    <span className="tabular ml-3 shrink-0 text-sm font-semibold text-foreground">
                      {stage.value.toLocaleString("es-MX")}
                    </span>
                  </div>
                </div>
                <div className="tabular w-14 shrink-0 text-right text-xs text-muted-foreground">
                  {rateFromStart.toFixed(1)}%
                </div>
              </div>
              {i < stages.length - 1 && (
                <div className="flex items-center gap-2 py-1.5 pl-10 text-xs text-muted-foreground/70">
                  <TrendingDownIcon className="size-3" />
                  {stage.isHighestDropoff && (
                    <span className="rounded-full bg-status-critical/15 px-2 py-0.5 font-medium text-status-critical">
                      mayor caída
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {note && <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{note}</p>}
    </Section>
  );
}

/** One per event conversion — real per-session OpenPanel funnel, unfiltered by path. */
async function EventFunnel({
  op,
  range,
  conversion,
}: {
  op: OpenPanelCreds;
  range: ResolvedRange;
  conversion: Conversion;
}) {
  let result: Awaited<ReturnType<typeof getFunnel>> | null = null;
  let uniqueLeads: number | null = null;
  let error: string | null = null;

  try {
    [result, uniqueLeads] = await Promise.all([
      getFunnel(op, range, ["screen_view", conversion.key]),
      // Raw unique count of people who fired the event — deliberately NOT
      // the funnel's own completedUsers, see StageFunnel's leadsGenerated
      // doc comment.
      getUniqueLeadCount(op, range, [conversion.key]),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !result || uniqueLeads === null) {
    return <ErrorCard message={`${conversion.label}: ${error}`} />;
  }

  const stages: FunnelStage[] = result.steps.map((s) => ({
    label: s.eventName,
    value: s.users,
    isHighestDropoff: s.isHighestDropoff,
  }));

  return (
    <StageFunnel
      title={conversion.label}
      stages={stages}
      overallConversionRate={result.overallConversionRate}
      leadsGenerated={uniqueLeads}
    />
  );
}

/**
 * One per form conversion — visita al sitio → visita a la página del
 * formulario → lo llenan. Ensamblado a mano desde tres fuentes reales (no
 * hay un solo `/funnel` que lo resuelva, ver nota en `StageFunnel`), todo
 * en sesiones para que las etapas compartan unidad. Without a `pagePath`
 * configured there's no middle stage to show, so it's a 2-stage funnel.
 */
async function PageFormFunnel({
  op,
  conversion,
  conversions,
  range,
}: {
  op: OpenPanelCreds;
  conversion: Conversion;
  /**
   * Final-stage count, passed in already computed from Postgres by the
   * caller (see `FunnelsPage` below) instead of fetched here from
   * OpenPanel — Postgres is the single source of truth for "how many people
   * submitted this form", matching the Leads page exactly (the OpenPanel
   * event count used to disagree with it by 1, e.g. 13 vs. 12).
   */
  conversions: number;
  range: ResolvedRange;
}) {
  let stages: FunnelStage[] | null = null;
  let overallConversionRate = 0;
  let error: string | null = null;
  const pagePath = conversion.pagePath;

  try {
    const [overview, pages] = await Promise.all([
      getOverview(op, range),
      pagePath ? getPagePerformance(op, range, 100) : Promise.resolve(null),
    ]);

    const totalSessions = overview.summary.total_sessions;
    stages = [{ label: "Visitas totales", value: totalSessions }];
    if (pagePath) {
      const pageSessions = pages?.pages.find((p) => p.path === pagePath)?.sessions ?? 0;
      stages.push({ label: `Vista de ${pagePath}`, value: pageSessions });
    }
    stages.push({ label: "Leads registrados", value: conversions });
    overallConversionRate = totalSessions > 0 ? (conversions / totalSessions) * 100 : 0;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !stages) {
    return <ErrorCard message={`${conversion.label}: ${error}`} />;
  }

  return (
    <StageFunnel
      title={conversion.label}
      stages={stages}
      overallConversionRate={overallConversionRate}
    />
  );
}

async function LeadsJourney({
  op,
  slug,
  range,
  conversions,
  formCounts,
  formDaily,
}: {
  op: OpenPanelCreds;
  slug: string;
  range: ResolvedRange;
  conversions: Conversion[];
  /** Postgres row count per form conversion key, fetched once by the caller. */
  formCounts: Map<string, number>;
  /** Postgres row count per `${day}|${key}`, same source. */
  formDaily: Map<string, number>;
}) {
  let stages: JourneyStage[] | null = null;
  let dailyChartData: Record<string, string | number>[] = [];
  let error: string | null = null;
  const eventConversions = conversions.filter((c) => c.kind === "event");

  try {
    const [overview, daily, eventLeadCounts] = await Promise.all([
      getOverview(op, range),
      eventConversions.length > 0
        ? getDailyEventCounts(
            op,
            range,
            eventConversions.map((c) => c.key),
          )
        : Promise.resolve([]),
      // Unique converting people across the whole range, per event —
      // deliberately NOT `daily`'s per-day counts summed together, which
      // would double-count anyone who converted on more than one day. See
      // getUniqueLeadCount's doc comment.
      Promise.all(eventConversions.map((c) => getUniqueLeadCount(op, range, [c.key]))),
    ]);
    // Impresiones: simulated — spend-derived ad impressions + SEO
    // impressions from the mock sources (swapping both halves to real is
    // still a pending follow-up, see CLAUDE.md "Not yet done").
    const ads = getAdsOverview(slug, range);
    const seo = getSeoOverview(slug, range);
    const impressions = ads.impressions + seo.impressions;

    // Same formula as the Leads page's "Total de leads" card: unique people
    // per event conversion (OpenPanel) + rows per form conversion
    // (Postgres, the source of truth for form leads app-wide — it's where
    // the actual name/email/phone lives).
    const formTotal = [...formCounts.values()].reduce((sum, n) => sum + n, 0);
    const leads = eventLeadCounts.reduce((sum, n) => sum + n, 0) + formTotal;

    stages = [
      {
        label: "Impresiones",
        value: Math.round(impressions),
        simulated: true,
        hint: "Anuncios + búsqueda orgánica (simulado)",
      },
      {
        label: "Tráfico",
        value: overview.summary.unique_visitors,
        hint: "Visitantes únicos (OpenPanel)",
      },
      {
        label: "Leads",
        value: leads,
        hint: `${conversions.map((c) => c.label).join(" + ")} — mismo total que la pestaña Leads`,
      },
    ];

    const dailyByDate = new Map(daily.map((d) => [d.date, d]));
    dailyChartData = enumerateDays(range).map((date) => {
      const row: Record<string, string | number> = { date };
      for (const c of conversions) {
        row[c.key] =
          c.kind === "event"
            ? (dailyByDate.get(date)?.byEvent[c.key] ?? 0)
            : (formDaily.get(`${date}|${c.key}`) ?? 0);
      }
      return row;
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !stages) {
    return <ErrorCard message={`Recorrido de leads: ${error}`} />;
  }

  return (
    <>
      <JourneyIndicator stages={stages} />
      <Section title="Leads por día">
        <p className="-mt-1 mb-3 text-xs text-muted-foreground">
          Por fuente. Los eventos cuentan personas únicas por día y los formularios cuentan
          leads recibidos — la misma persona convirtiendo en más de un día se cuenta en cada
          uno, por eso la suma de las barras no coincide exactamente con el total de arriba.
        </p>
        <StackedBars
          data={dailyChartData}
          series={conversions.map((c, i) => ({ key: c.key, label: c.label, color: seriesColor(i) }))}
          height={220}
        />
      </Section>
    </>
  );
}

/**
 * "Detalles de {conversión}" — where/when the main event conversion (the
 * first one configured) happens, one level deeper than the funnel's
 * pass/fail count above. Raw-count based, not deduped by person (see
 * `getEventDetail`'s doc comment) — the question here is "which
 * pages/states/hours generate clicks", which is naturally a count of
 * actions.
 */
async function EventConversionDetail({
  op,
  range,
  conversion,
}: {
  op: OpenPanelCreds;
  range: ResolvedRange;
  conversion: Conversion;
}) {
  let detail: Awaited<ReturnType<typeof getEventDetail>> | null = null;
  let pages: Awaited<ReturnType<typeof getPagePerformance>>["pages"] = [];
  let error: string | null = null;
  try {
    // High limit — lookup pool for the page-detail modal on "Páginas que
    // más generan clics" below, not something displayed directly here.
    // See ClickablePageBars' doc comment for why this needs its own
    // fetch rather than reusing the click-count rows.
    const [detailResult, pagePerformanceResult] = await Promise.all([
      getEventDetail(op, range, conversion.key),
      getPagePerformance(op, range, 200),
    ]);
    detail = detailResult;
    pages = pagePerformanceResult.pages;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !detail) {
    return <ErrorCard message={`Detalles de ${conversion.label}: ${error}`} />;
  }

  const peakStart = String(detail.peakHour).padStart(2, "0");
  const peakEnd = String((detail.peakHour + 1) % 24).padStart(2, "0");
  const peakCount = detail.hourly[detail.peakHour]?.count ?? 0;
  const peakShare = detail.totalEvents > 0 ? (peakCount / detail.totalEvents) * 100 : 0;

  const hourlyChartData = detail.hourly.map((h) => ({
    name: `${String(h.hour).padStart(2, "0")}h`,
    count: h.count,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Detalles de {conversion.label}
        </h2>
        <span className="tabular text-xs text-muted-foreground">
          {detail.totalEvents.toLocaleString("es-MX")} clics en el rango
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Páginas que más generan clics (top 10)">
          <ClickablePageBars
            rows={detail.topPaths.map((p) => ({ label: p.label, value: p.count }))}
            pages={pages}
          />
        </Section>
        <Section title="Estados con más clics (top 10)">
          <RankedBars
            rows={detail.topRegions.map((r) => ({ label: r.label, value: r.count }))}
            color="var(--chart-2)"
          />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr]">
        <StatCard
          label="Horario pico (hora CDMX)"
          value={`${peakStart}:00–${peakEnd}:00`}
          icon={<ClockIcon className="size-4" strokeWidth={2.25} />}
        />
        <Section
          title="Clics por hora del día"
          action={
            <span className="tabular text-xs text-muted-foreground">
              {peakShare.toFixed(0)}% del total en la hora pico
            </span>
          }
        >
          <CategoryBars
            data={hourlyChartData}
            dataKey="count"
            nameKey="name"
            colors={["var(--chart-1)"]}
            height={180}
          />
        </Section>
      </div>
    </div>
  );
}

export default async function FunnelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await params;
  const range = resolveRange(await searchParams);
  const header = (connected: boolean | null) => (
    <PageHeader
      eyebrow="Analytics en vivo · OpenPanel"
      title="Funnels"
      description={`${format(parseISO(range.startDate), "d MMM", { locale: es })} — ${format(parseISO(range.endDate), "d MMM yyyy", { locale: es })}.`}
      action={connected === null ? undefined : <SourceStatusBadge connected={connected} />}
    />
  );

  let config: Awaited<ReturnType<typeof getClientConfig>> | null = null;
  let configError: string | null = null;
  try {
    config = await getClientConfig(client);
  } catch (e) {
    configError = e instanceof Error ? e.message : String(e);
  }

  if (!config) {
    return (
      <div className="flex flex-col gap-6">
        {header(false)}
        <ErrorCard message={configError ?? "Sin datos"} />
      </div>
    );
  }

  const op = config.openpanel;
  const { conversions } = config;
  if (!op || conversions.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header(null)}
        <NotConnected client={client} integration={op ? "conversions" : "openpanel"} />
      </div>
    );
  }

  // Fetched once here, at the page level, and threaded down to
  // LeadsJourney + every PageFormFunnel — see those components' doc
  // comments for why they don't each independently ask OpenPanel for this.
  // Left empty (not error-blocking) if Postgres is unreachable: the page
  // still has real OpenPanel data to show for the event side.
  const formConversions = conversions.filter((c) => c.kind === "form");
  const formCounts = new Map(formConversions.map((c) => [c.key, 0]));
  const formDaily = new Map<string, number>();
  try {
    const leads = await getLeadsFromDb(client, range);
    for (const lead of leads) {
      if (!formCounts.has(lead.source)) continue;
      formCounts.set(lead.source, (formCounts.get(lead.source) ?? 0) + 1);
      // UTC day, same bucketing as getDailyEventCounts' OpenPanel side.
      const dayKey = `${lead.createdAt.slice(0, 10)}|${lead.source}`;
      formDaily.set(dayKey, (formDaily.get(dayKey) ?? 0) + 1);
    }
  } catch {
    // leave at 0
  }

  const mainEvent = conversions.find((c) => c.kind === "event");

  return (
    <div className="flex flex-col gap-6">
      {header(true)}

      <LeadsJourney
        op={op}
        slug={config.slug}
        range={range}
        conversions={conversions}
        formCounts={formCounts}
        formDaily={formDaily}
      />

      <section className="grid gap-6 lg:grid-cols-3">
        {conversions.map((c) =>
          c.kind === "event" ? (
            <EventFunnel key={c.key} op={op} range={range} conversion={c} />
          ) : (
            <PageFormFunnel
              key={c.key}
              op={op}
              conversion={c}
              conversions={formCounts.get(c.key) ?? 0}
              range={range}
            />
          ),
        )}
      </section>

      {mainEvent && <EventConversionDetail op={op} range={range} conversion={mainEvent} />}

      <Section title="Nota metodológica">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Las conversiones por evento (por ejemplo, un clic a WhatsApp) miden hasta la acción en
          el sitio — no hay forma de saber si esa conversación cerró venta sin que el vendedor
          lo capture en el CRM. Los embudos de formulario son de 3 pasos (visita al sitio →
          visita a la página del formulario → lead registrado) armados con el tráfico de
          OpenPanel y los leads que llegan al webhook, no un único funnel de sesión como los de
          evento. Los leads de formulario guardan nombre, correo y teléfono en la pestaña Leads.
          Las conversiones de este dashboard se editan en Configuración.
        </p>
      </Section>
    </div>
  );
}

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ClockIcon, FunnelIcon, TrendingDownIcon } from "lucide-react";
import {
  getDailyEventCounts,
  getEventDetail,
  getFunnel,
  getOverview,
  getPagePerformance,
  getUniqueLeadCount,
} from "@/lib/openpanel";
import { getAdsOverview, getSeoOverview } from "@/lib/mock-data";
import { getClientConfig, type ClientConfig } from "@/lib/client-config";
import { resolveRange, type ResolvedRange } from "@/lib/date-range";
import { ErrorCard, PageHeader, Section, SourceStatusBadge, StatCard } from "@/components/ui-kit";
import { JourneyIndicator, type JourneyStage } from "@/components/journey-indicator";
import { CategoryBars, RankedBars, StackedBars } from "@/components/charts";

export const dynamic = "force-dynamic";

const LEAD_EVENTS = ["whatsapp_click", "form_submitted"];
const LEAD_SERIES = [
  { key: "whatsapp_click", label: "WhatsApp", color: "var(--chart-1)" },
  { key: "form_submitted", label: "Formulario", color: "var(--chart-2)" },
];

interface FunnelStage {
  label: string;
  value: number;
  isHighestDropoff?: boolean;
}

/**
 * Shared bar-funnel visual for all three "embudos" on this page. Two flavors
 * feed it: the real per-session OpenPanel `/funnel` result (WhatsApp — see
 * `WhatsappFunnel`), and a manually-assembled 3-stage flow for the two
 * form-based funnels (see `PageFormFunnel`) — `/funnel`'s `steps` only takes
 * plain event names, it can't filter a step to "screen_view on this one
 * path", so those two are stitched together from `/overview` +
 * `/pages/performance` + `/events` instead of a single funnel query.
 */
function StageFunnel({
  title,
  stages,
  overallConversionRate,
  note,
}: {
  title: string;
  stages: FunnelStage[];
  overallConversionRate: number;
  note?: string;
}) {
  const maxValue = stages[0]?.value ?? 1;
  const leadsGenerated = stages[stages.length - 1]?.value ?? 0;

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

/** Embudo 1 — real per-session OpenPanel funnel, unfiltered by path. */
async function WhatsappFunnel({ config, range }: { config: ClientConfig; range: ResolvedRange }) {
  let result: Awaited<ReturnType<typeof getFunnel>> | null = null;
  let error: string | null = null;

  try {
    result = await getFunnel(config.openpanel, range, ["screen_view", "whatsapp_click"]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !result) {
    return <ErrorCard message={`Clic WhatsApp: ${error}`} />;
  }

  const stages: FunnelStage[] = result.steps.map((s) => ({
    label: s.eventName,
    value: s.users,
    isHighestDropoff: s.isHighestDropoff,
  }));

  return (
    <StageFunnel
      title="Clic WhatsApp"
      stages={stages}
      overallConversionRate={result.overallConversionRate}
    />
  );
}

/**
 * Embudos 2 y 3 — visita al sitio → visita a la página del formulario →
 * lo llenan. Ensamblado a mano desde tres endpoints reales (no hay un solo
 * `/funnel` que lo resuelva, ver nota en `StageFunnel`), todo en sesiones
 * para que las tres etapas compartan unidad.
 */
async function PageFormFunnel({
  config,
  title,
  pagePath,
  pageStageLabel,
  conversionEventName,
  conversionStageLabel,
  range,
  note,
}: {
  config: ClientConfig;
  title: string;
  pagePath: string;
  pageStageLabel: string;
  conversionEventName: string;
  conversionStageLabel: string;
  range: ResolvedRange;
  note?: string;
}) {
  let stages: FunnelStage[] | null = null;
  let overallConversionRate = 0;
  let error: string | null = null;

  try {
    const [overview, pages, conversions] = await Promise.all([
      getOverview(config.openpanel, range),
      getPagePerformance(config.openpanel, range, 100),
      // Unique converting people, not raw action count — see
      // getUniqueLeadCount's doc comment.
      getUniqueLeadCount(config.openpanel, range, [conversionEventName]),
    ]);

    const totalSessions = overview.summary.total_sessions;
    const pageSessions = pages.pages.find((p) => p.path === pagePath)?.sessions ?? 0;

    stages = [
      { label: "Visitas totales", value: totalSessions },
      { label: pageStageLabel, value: pageSessions },
      { label: conversionStageLabel, value: conversions },
    ];
    overallConversionRate = totalSessions > 0 ? (conversions / totalSessions) * 100 : 0;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !stages) {
    return <ErrorCard message={`${title}: ${error}`} />;
  }

  return (
    <StageFunnel
      title={title}
      stages={stages}
      overallConversionRate={overallConversionRate}
      note={note}
    />
  );
}

async function LeadsJourney({ config, range }: { config: ClientConfig; range: ResolvedRange }) {
  let stages: JourneyStage[] | null = null;
  let dailyChartData: Record<string, string | number>[] = [];
  let error: string | null = null;

  try {
    const [overview, daily, leads] = await Promise.all([
      getOverview(config.openpanel, range),
      getDailyEventCounts(config.openpanel, range, LEAD_EVENTS),
      // Unique converting people across the whole range — deliberately
      // NOT `daily`'s per-day counts summed together, which would
      // double-count anyone who converted on more than one day. See
      // getUniqueLeadCount's doc comment.
      getUniqueLeadCount(config.openpanel, range, LEAD_EVENTS),
    ]);
    // Impresiones: no ad/GSC account connected yet, so this stage is
    // simulated — spend-derived ad impressions + SEO impressions, the same
    // mock sources the Publicidad/SEO pages already use.
    const ads = getAdsOverview(config.slug, range);
    const seo = getSeoOverview(config.slug, range);
    const impressions = ads.impressions + seo.impressions;

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
        hint: "Personas únicas: WhatsApp + formularios (OpenPanel)",
      },
    ];
    dailyChartData = daily.map((d) => ({
      date: d.date,
      whatsapp_click: d.byEvent.whatsapp_click ?? 0,
      form_submitted: d.byEvent.form_submitted ?? 0,
    }));
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
          Personas únicas por día (clic WhatsApp + formulario de contacto) — la misma
          persona convirtiendo en más de un día se cuenta en cada uno, por eso la suma
          de las barras no coincide exactamente con el total de arriba. No incluye
          descargas de catálogo — para tasa de conversión por visitante ver los
          embudos abajo.
        </p>
        <StackedBars data={dailyChartData} series={LEAD_SERIES} height={220} />
      </Section>
    </>
  );
}

/**
 * "Detalle del embudo de WhatsApp" — where/when WhatsApp clicks happen,
 * one level deeper than the funnel's pass/fail count above. Raw-count
 * based, not deduped by person (see `getEventDetail`'s doc comment) — the
 * question here is "which pages/states/hours generate clicks", which is
 * naturally a count of actions.
 */
async function WhatsappClickDetail({
  config,
  range,
}: {
  config: ClientConfig;
  range: ResolvedRange;
}) {
  let detail: Awaited<ReturnType<typeof getEventDetail>> | null = null;
  let error: string | null = null;
  try {
    detail = await getEventDetail(config.openpanel, range, "whatsapp_click");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !detail) {
    return <ErrorCard message={`Detalle del embudo de WhatsApp: ${error}`} />;
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
          Detalles del embudo de Whatsapp
        </h2>
        <span className="tabular text-xs text-muted-foreground">
          {detail.totalEvents.toLocaleString("es-MX")} clics en el rango
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Páginas que más generan clics (top 10)">
          <RankedBars rows={detail.topPaths.map((p) => ({ label: p.label, value: p.count }))} />
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

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await params;
  const range = resolveRange(await searchParams);

  let config: ClientConfig | null = null;
  let configError: string | null = null;
  try {
    config = await getClientConfig(client);
  } catch (e) {
    configError = e instanceof Error ? e.message : String(e);
  }

  if (!config) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Analytics en vivo · OpenPanel" title="Conversiones" />
        <ErrorCard message={configError ?? "Sin datos"} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Analytics en vivo · OpenPanel"
        title="Conversiones"
        description={`${format(parseISO(range.startDate), "d MMM", { locale: es })} — ${format(parseISO(range.endDate), "d MMM yyyy", { locale: es })}.`}
        action={<SourceStatusBadge connected />}
      />

      <LeadsJourney config={config} range={range} />

      <section className="grid gap-6 lg:grid-cols-3">
        <WhatsappFunnel config={config} range={range} />
        <PageFormFunnel
          config={config}
          title="Formulario de contacto"
          pagePath="/contactanos"
          pageStageLabel="Vista de /contactanos"
          conversionEventName="form_submitted"
          conversionStageLabel="Formulario enviado"
          range={range}
        />
        <PageFormFunnel
          config={config}
          title="Descarga de catálogo"
          pagePath="/catalogo-lumi"
          pageStageLabel="Vista de /catalogo-lumi"
          conversionEventName="catalog_download"
          conversionStageLabel="Catálogo descargado"
          range={range}
          note="No cuenta como lead en el indicador de arriba — es interés de
            catálogo, no intención directa de contacto."
        />
      </section>

      <WhatsappClickDetail config={config} range={range} />

      <Section title="Nota metodológica">
        <p className="text-sm leading-relaxed text-muted-foreground">
          WhatsApp mide hasta &quot;le dio clic para hablar&quot; — no hay forma de
          saber si esa conversación cerró venta sin que el vendedor lo capture en el
          CRM manualmente. Los embudos de formulario y catálogo son de 3 pasos
          (visita al sitio → visita a la página → conversión) ensamblados desde
          tráfico + eventos, no de un único funnel de sesión como el de WhatsApp —
          ver <code className="text-xs">lib/openpanel.ts</code> si necesitas el
          detalle técnico. Los eventos solo cuentan envíos (sin datos personales) —
          el nombre/email de cada contacto vive en el plugin CF7DB de WordPress,
          cruzable por fecha/hora con estos conteos. A futuro, cruzar eso contra el
          CRM (Twenty) da un funnel real hasta venta cerrada.
        </p>
      </Section>
    </div>
  );
}

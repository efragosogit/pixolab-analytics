import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { FunnelIcon, TrendingDownIcon } from "lucide-react";
import { getDailyEventCounts, getFunnel, getOverview, getPagePerformance } from "@/lib/openpanel";
import { getAdsOverview, getSeoOverview } from "@/lib/mock-data";
import { getClientConfig, type ClientConfig } from "@/lib/client-config";
import { resolveRange, type ResolvedRange } from "@/lib/date-range";
import { ErrorCard, PageHeader, Section, SourceStatusBadge } from "@/components/ui-kit";
import { JourneyIndicator, type JourneyStage } from "@/components/journey-indicator";
import { StackedBars } from "@/components/charts";

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
    const [overview, pages, daily] = await Promise.all([
      getOverview(config.openpanel, range),
      getPagePerformance(config.openpanel, range, 100),
      getDailyEventCounts(config.openpanel, range, [conversionEventName]),
    ]);

    const totalSessions = overview.summary.total_sessions;
    const pageSessions = pages.pages.find((p) => p.path === pagePath)?.sessions ?? 0;
    const conversions = daily.reduce((sum, d) => sum + d.total, 0);

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
    const [overview, daily] = await Promise.all([
      getOverview(config.openpanel, range),
      getDailyEventCounts(config.openpanel, range, LEAD_EVENTS),
    ]);
    // Impresiones: no ad/GSC account connected yet, so this stage is
    // simulated — spend-derived ad impressions + SEO impressions, the same
    // mock sources the Publicidad/SEO pages already use.
    const ads = getAdsOverview(config.slug, range);
    const seo = getSeoOverview(config.slug, range);
    const impressions = ads.impressions + seo.impressions;
    const leads = daily.reduce((sum, d) => sum + d.total, 0);

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
        hint: "Clics WhatsApp + formularios (OpenPanel)",
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
          Conteo de eventos de conversión (clic WhatsApp + formulario de contacto), no
          incluye descargas de catálogo ni visitantes únicos — para tasa de conversión
          por visitante ver los embudos abajo.
        </p>
        <StackedBars data={dailyChartData} series={LEAD_SERIES} height={220} />
      </Section>
    </>
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

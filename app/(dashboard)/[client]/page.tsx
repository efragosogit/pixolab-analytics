import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { MonitorSmartphoneIcon, EyeIcon, PercentIcon, TimerIcon, UsersIcon } from "lucide-react";
import {
  getOverview,
  getPagePerformance,
  getTopPages,
  getTrafficDevices,
  getTrafficReferrers,
} from "@/lib/openpanel";
import { getClientConfig } from "@/lib/client-config";
import { percentDelta, previousRange, resolveRange } from "@/lib/date-range";
import { ErrorCard, PageHeader, Section, SourceStatusBadge, StatCard } from "@/components/ui-kit";
import { RankedBars, TrendArea } from "@/components/charts";
import { ClickablePageBars } from "@/components/clickable-page-bars";

export const dynamic = "force-dynamic";

function fmtPercent(v: number) {
  return `${v.toFixed(1)}%`;
}
function fmtDuration(v: number) {
  const mins = Math.floor(v / 60);
  const secs = Math.round(v % 60);
  return `${mins}m ${secs}s`;
}
function fmtNumber(v: number) {
  return v.toLocaleString("es-MX");
}

export default async function TrafficPage({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await params;
  const range = resolveRange(await searchParams);
  const prev = previousRange(range);

  let error: string | null = null;
  let overview: Awaited<ReturnType<typeof getOverview>> | null = null;
  let prevOverview: Awaited<ReturnType<typeof getOverview>> | null = null;
  let topPages: Awaited<ReturnType<typeof getTopPages>> = [];
  let referrers: Awaited<ReturnType<typeof getTrafficReferrers>> = [];
  let devices: Awaited<ReturnType<typeof getTrafficDevices>> = [];
  let pagePerformance: Awaited<ReturnType<typeof getPagePerformance>>["pages"] = [];

  try {
    const config = await getClientConfig(client);
    let pagePerformanceResult: Awaited<ReturnType<typeof getPagePerformance>>;
    [overview, prevOverview, topPages, referrers, devices, pagePerformanceResult] =
      await Promise.all([
        getOverview(config.openpanel, range),
        getOverview(config.openpanel, prev),
        getTopPages(config.openpanel, range),
        getTrafficReferrers(config.openpanel, range),
        getTrafficDevices(config.openpanel, range),
        // High limit, not the 8 actually displayed below — this is also
        // the lookup pool for ClickablePageBars' detail modal, and
        // "Páginas más visitadas" ranks by pageviews while this endpoint
        // ranks its own top-N by sessions, so the two lists don't line up
        // 1:1; a generous limit maximizes the chance a clicked page is
        // found (confirmed live: this endpoint has no ~100-row cap like
        // /events does, 230/230 pages came back for a real 30-day range).
        getPagePerformance(config.openpanel, range, 200),
      ]);
    pagePerformance = pagePerformanceResult.pages;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const s = overview?.summary;
  const ps = prevOverview?.summary;

  const series = (overview?.series ?? []).map((d) => ({
    date: d.date,
    Visitantes: d.unique_visitors,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Analytics en vivo · OpenPanel"
        title="Tráfico general"
        description={`${format(parseISO(range.startDate), "d MMM yyyy", { locale: es })} — ${format(parseISO(range.endDate), "d MMM yyyy", { locale: es })}`}
        action={<SourceStatusBadge connected={!error} />}
      />

      {error ? (
        <ErrorCard message={error} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Visitantes"
              value={fmtNumber(s?.unique_visitors ?? 0)}
              delta={percentDelta(s?.unique_visitors ?? 0, ps?.unique_visitors ?? 0)}
              icon={<UsersIcon className="size-4" />}
              accent
            />
            <StatCard
              label="Sesiones"
              value={fmtNumber(s?.total_sessions ?? 0)}
              delta={percentDelta(s?.total_sessions ?? 0, ps?.total_sessions ?? 0)}
              icon={<MonitorSmartphoneIcon className="size-4" />}
            />
            <StatCard
              label="Pageviews"
              value={fmtNumber(s?.total_screen_views ?? 0)}
              delta={percentDelta(s?.total_screen_views ?? 0, ps?.total_screen_views ?? 0)}
              icon={<EyeIcon className="size-4" />}
            />
            <StatCard
              label="Bounce rate"
              value={fmtPercent(s?.bounce_rate ?? 0)}
              delta={percentDelta(s?.bounce_rate ?? 0, ps?.bounce_rate ?? 0)}
              deltaGoodDirection="down"
              icon={<PercentIcon className="size-4" />}
            />
            <StatCard
              label="Duración prom."
              value={fmtDuration(s?.avg_session_duration ?? 0)}
              delta={percentDelta(s?.avg_session_duration ?? 0, ps?.avg_session_duration ?? 0)}
              icon={<TimerIcon className="size-4" />}
            />
          </section>

          <Section title="Visitantes únicos en el tiempo">
            <TrendArea
              data={series}
              dataKey="Visitantes"
              format="compact"
            />
          </Section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Section title="Páginas más visitadas">
              <ClickablePageBars
                format="compact"
                rows={topPages.slice(0, 8).map((p) => ({ label: p.path, value: p.pageviews }))}
                pages={pagePerformance}
              />
            </Section>

            <Section title="Fuentes de tráfico">
              <RankedBars
                format="compact"
                color="var(--chart-1)"
                rows={referrers
                  .slice(0, 8)
                  .map((r) => ({ label: r.name || "(directo)", value: r.sessions }))}
              />
            </Section>

            <Section title="Dispositivos">
              <RankedBars
                format="compact"
                color="var(--chart-3)"
                rows={devices.map((d) => ({
                  label: d.name ?? "(desconocido)",
                  value: d.sessions,
                }))}
              />
            </Section>
          </section>
        </>
      )}
    </div>
  );
}

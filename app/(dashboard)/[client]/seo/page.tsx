import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { MousePointerClickIcon, EyeIcon, PercentIcon, ListOrderedIcon } from "lucide-react";
import { getSeoOverview, getSeoQueries } from "@/lib/gsc";
import { getClientConfig } from "@/lib/client-config";
import { percentDelta, previousRange, resolveRange } from "@/lib/date-range";
import { ErrorCard, PageHeader, Section, SourceStatusBadge, StatCard } from "@/components/ui-kit";
import { TrendArea } from "@/components/charts";

export const dynamic = "force-dynamic";

function fmtNumber(v: number) {
  return v.toLocaleString("es-MX");
}
function fmtCompact(v: number) {
  return Intl.NumberFormat("es-MX", { notation: "compact" }).format(v);
}

export default async function SeoPage({
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
  let overview: Awaited<ReturnType<typeof getSeoOverview>> | null = null;
  let prevOverview: Awaited<ReturnType<typeof getSeoOverview>> | null = null;
  let queries: Awaited<ReturnType<typeof getSeoQueries>> = [];

  try {
    const config = await getClientConfig(client);
    [overview, prevOverview, queries] = await Promise.all([
      getSeoOverview(config.gscSiteUrl, range),
      getSeoOverview(config.gscSiteUrl, prev),
      getSeoQueries(config.gscSiteUrl, range),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Google Search Console"
        title="SEO"
        description={`${format(parseISO(range.startDate), "d MMM", { locale: es })} — ${format(parseISO(range.endDate), "d MMM yyyy", { locale: es })}. Conectado directo a Search Console (cuenta de servicio, sin pasar por OpenPanel) — ver lib/gsc.ts.`}
        action={<SourceStatusBadge connected={!error} />}
      />

      {error || !overview ? (
        <ErrorCard message={error ?? "Sin datos"} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Clics"
              value={fmtNumber(overview.clicks)}
              delta={percentDelta(overview.clicks, prevOverview?.clicks ?? 0)}
              icon={<MousePointerClickIcon className="size-4" />}
              accent
            />
            <StatCard
              label="Impresiones"
              value={fmtCompact(overview.impressions)}
              delta={percentDelta(overview.impressions, prevOverview?.impressions ?? 0)}
              icon={<EyeIcon className="size-4" />}
            />
            <StatCard
              label="CTR promedio"
              value={`${overview.ctr.toFixed(1)}%`}
              delta={percentDelta(overview.ctr, prevOverview?.ctr ?? 0)}
              icon={<PercentIcon className="size-4" />}
            />
            <StatCard
              label="Posición promedio"
              value={overview.avgPosition.toFixed(1)}
              delta={percentDelta(overview.avgPosition, prevOverview?.avgPosition ?? 0)}
              deltaGoodDirection="down"
              icon={<ListOrderedIcon className="size-4" />}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Section title="Clics por día">
              <TrendArea
                data={overview.series}
                dataKey="clicks"
                color="var(--chart-1)"
                format="compact"
                height={200}
              />
            </Section>
            <Section title="Impresiones por día">
              <TrendArea
                data={overview.series}
                dataKey="impressions"
                color="var(--chart-1)"
                format="compact"
                height={200}
              />
            </Section>
          </section>

          <Section title="Búsquedas principales">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 pl-1 font-medium">Consulta</th>
                    <th className="py-3 text-right font-medium">Clics</th>
                    <th className="py-3 text-right font-medium">Impresiones</th>
                    <th className="py-3 text-right font-medium">CTR</th>
                    <th className="py-3 pr-1 text-right font-medium">Posición</th>
                  </tr>
                </thead>
                <tbody>
                  {queries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        Sin datos en este rango.
                      </td>
                    </tr>
                  ) : (
                    queries.map((q) => (
                      <tr
                        key={q.query}
                        className="border-b border-border/40 last:border-0 hover:bg-accent/40"
                      >
                        <td className="py-3 pl-1 font-medium text-foreground">{q.query}</td>
                        <td className="tabular py-3 text-right text-foreground">
                          {q.clicks.toLocaleString("es-MX")}
                        </td>
                        <td className="tabular py-3 text-right text-foreground/80">
                          {q.impressions.toLocaleString("es-MX")}
                        </td>
                        <td className="tabular py-3 text-right text-foreground/80">
                          {q.ctr.toFixed(1)}%
                        </td>
                        <td className="tabular py-3 pr-1 text-right">
                          <span
                            className={
                              q.position <= 3
                                ? "text-status-good"
                                : q.position <= 10
                                  ? "text-status-warning"
                                  : "text-muted-foreground"
                            }
                          >
                            {q.position.toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

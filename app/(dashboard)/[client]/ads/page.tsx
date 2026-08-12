import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CoinsIcon, TargetIcon, TrendingUpIcon, ReceiptIcon } from "lucide-react";
import { getAdsCampaigns, getAdsOverview } from "@/lib/google-ads";
import { getClientConfig } from "@/lib/client-config";
import { percentDelta, previousRange, resolveRange } from "@/lib/date-range";
import { ErrorCard, PageHeader, Section, SourceStatusBadge, StatCard } from "@/components/ui-kit";
import { TrendArea } from "@/components/charts";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const currency = (v: number) =>
  v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export default async function AdsPage({
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
  let overview: Awaited<ReturnType<typeof getAdsOverview>> | null = null;
  let prevOverview: Awaited<ReturnType<typeof getAdsOverview>> | null = null;
  let campaigns: Awaited<ReturnType<typeof getAdsCampaigns>> = [];
  let customerId = "";

  try {
    const config = await getClientConfig(client);
    customerId = config.googleAdsCustomerId;
    [overview, prevOverview, campaigns] = await Promise.all([
      getAdsOverview(customerId, range),
      getAdsOverview(customerId, prev),
      getAdsCampaigns(customerId, range),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Google Ads"
        title="Publicidad y campañas"
        description={`${format(parseISO(range.startDate), "d MMM", { locale: es })} — ${format(parseISO(range.endDate), "d MMM yyyy", { locale: es })}. Conectado directo a Google Ads (OAuth, cuenta ${customerId}) — ver lib/google-ads.ts. Meta Ads todavía no está conectado.`}
        action={<SourceStatusBadge connected={!error} />}
      />

      {error || !overview ? (
        <ErrorCard message={error ?? "Sin datos"} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Gasto total"
              value={currency(overview.spend)}
              delta={percentDelta(overview.spend, prevOverview?.spend ?? 0)}
              deltaGoodDirection="down"
              icon={<CoinsIcon className="size-4" />}
              accent
            />
            <StatCard
              label="Conversiones"
              value={overview.conversions.toLocaleString("es-MX")}
              delta={percentDelta(overview.conversions, prevOverview?.conversions ?? 0)}
              icon={<TargetIcon className="size-4" />}
            />
            <StatCard
              label="Costo por conversión"
              value={currency(overview.cpa)}
              delta={percentDelta(overview.cpa, prevOverview?.cpa ?? 0)}
              deltaGoodDirection="down"
              icon={<ReceiptIcon className="size-4" />}
            />
            <StatCard
              label="ROAS"
              value={`${overview.roas.toFixed(2)}x`}
              delta={percentDelta(overview.roas, prevOverview?.roas ?? 0)}
              icon={<TrendingUpIcon className="size-4" />}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Section title="Gasto por día">
              <TrendArea
                data={overview.series}
                dataKey="spend"
                color="var(--chart-1)"
                format="currency"
                height={200}
              />
            </Section>
            <Section title="Conversiones por día">
              <TrendArea
                data={overview.series}
                dataKey="conversions"
                color="var(--chart-3)"
                height={200}
              />
            </Section>
          </section>

          <Section title="Campañas">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 pl-1 font-medium">Campaña</th>
                    <th className="py-3 text-right font-medium">Gasto</th>
                    <th className="py-3 text-right font-medium">Clics</th>
                    <th className="py-3 text-right font-medium">Conversiones</th>
                    <th className="py-3 text-right font-medium">CPA</th>
                    <th className="py-3 pr-1 text-right font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        Sin campañas en este rango.
                      </td>
                    </tr>
                  ) : (
                    campaigns.map((c) => (
                      <tr
                        key={c.name}
                        className="border-b border-border/40 last:border-0 hover:bg-accent/40"
                      >
                        <td className="py-3 pl-1">
                          <div className="font-medium text-foreground">{c.name}</div>
                          <Badge
                            variant="outline"
                            className="mt-1 border-chart-1/40 bg-chart-1/10 text-chart-1"
                          >
                            {c.platform}
                          </Badge>
                        </td>
                        <td className="tabular py-3 text-right text-foreground">
                          {currency(c.spend)}
                        </td>
                        <td className="tabular py-3 text-right text-foreground/80">
                          {c.clicks.toLocaleString("es-MX")}
                        </td>
                        <td className="tabular py-3 text-right text-foreground/80">
                          {c.conversions.toLocaleString("es-MX")}
                        </td>
                        <td className="tabular py-3 text-right text-foreground/80">
                          {currency(c.cpa)}
                        </td>
                        <td className="tabular py-3 pr-1 text-right">
                          <span className={c.roas >= 2 ? "text-status-good" : "text-status-warning"}>
                            {c.roas.toFixed(2)}x
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

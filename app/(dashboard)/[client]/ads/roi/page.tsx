import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CoinsIcon, TargetIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
import { getRoiHistory } from "@/lib/mock-data";
import { resolveRange } from "@/lib/date-range";
import { PageHeader, Section, SourceStatusBadge, StatCard } from "@/components/ui-kit";
import { TableScroll } from "@/components/table-scroll";
import { RoiMonthDetail } from "@/components/roi-month-detail";

export const dynamic = "force-dynamic";

const currency = (v: number) =>
  v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function monthLabel(key: string) {
  return format(parseISO(`${key}-01`), "MMMM yyyy", { locale: es });
}

export default async function RoiPage({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await params;
  const range = resolveRange(await searchParams);
  const history = getRoiHistory(client, range);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Paid media"
        title="ROI"
        description={`Historial mensual de inversión en anuncios contra ventas cerradas, hasta ${format(parseISO(range.endDate), "MMMM yyyy", { locale: es })}. Simulado — falta cruzar el CRM (Twenty) contra el gasto real de campañas para saber qué venta cerrada vino de cuál mes/campaña.`}
        action={<SourceStatusBadge connected={false} />}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Inversión total"
          value={currency(history.totalAdSpend)}
          icon={<CoinsIcon className="size-4" />}
        />
        <StatCard
          label="Leads totales"
          value={history.totalLeads.toLocaleString("es-MX")}
          icon={<UsersIcon className="size-4" />}
        />
        <StatCard
          label="Conversiones totales"
          value={history.totalConversions.toLocaleString("es-MX")}
          icon={<TargetIcon className="size-4" />}
        />
        <StatCard
          label="Ventas totales"
          value={currency(history.totalSales)}
          icon={<TrendingUpIcon className="size-4" />}
          accent
        />
      </section>

      <Section
        title="Historial"
        action={
          <span className="tabular text-xs text-muted-foreground">
            ROAS {history.roas.toFixed(2)}x
          </span>
        }
      >
        <TableScroll>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card py-3 pl-1 font-medium">Mes</th>
                <th className="py-3 text-right font-medium">Inversión ads</th>
                <th className="py-3 text-right font-medium">Ads clics</th>
                <th className="py-3 text-right font-medium">Leads</th>
                <th className="py-3 text-right font-medium">Conversiones</th>
                <th className="py-3 text-center font-medium">Detalle</th>
                <th className="py-3 pr-1 text-right font-medium">Ventas totales</th>
              </tr>
            </thead>
            <tbody>
              {history.months.map((m) => (
                <tr key={m.key} className="border-b border-border/40 last:border-0 hover:bg-accent/40">
                  <td className="sticky left-0 z-10 bg-card py-3 pl-1 font-medium capitalize text-foreground">
                    {monthLabel(m.key)}
                  </td>
                  <td className="tabular py-3 text-right text-foreground/80">
                    {currency(m.adSpend)}
                  </td>
                  <td className="tabular py-3 text-right text-foreground/80">
                    {m.adClicks.toLocaleString("es-MX")}
                  </td>
                  <td className="tabular py-3 text-right text-foreground/80">
                    {m.leads.toLocaleString("es-MX")}
                  </td>
                  <td className="tabular py-3 text-right text-foreground/80">
                    {m.conversions.toLocaleString("es-MX")}
                  </td>
                  <td className="py-3 text-center">
                    <RoiMonthDetail month={m} label={monthLabel(m.key)} />
                  </td>
                  <td className="tabular py-3 pr-1 text-right font-semibold text-status-good">
                    {currency(m.totalSales)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Section>
    </div>
  );
}

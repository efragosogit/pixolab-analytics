import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { getPagePerformance } from "@/lib/openpanel";
import { getClientConfig } from "@/lib/client-config";
import { resolveRange } from "@/lib/date-range";
import { ErrorCard, PageHeader, Section, SourceStatusBadge } from "@/components/ui-kit";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function PerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await params;
  const range = resolveRange(await searchParams);
  let result: Awaited<ReturnType<typeof getPagePerformance>> | null = null;
  let error: string | null = null;

  try {
    const config = await getClientConfig(client);
    result = await getPagePerformance(config.openpanel, range, 25);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Analytics en vivo · OpenPanel"
        title="Performance por página"
        description={`Bounce rate y tiempo en página — qué contenido realmente engancha. ${format(parseISO(range.startDate), "d MMM", { locale: es })} — ${format(parseISO(range.endDate), "d MMM yyyy", { locale: es })}.`}
        action={<SourceStatusBadge connected={!error} />}
      />

      {error || !result ? (
        <ErrorCard message={error ?? "Sin datos"} />
      ) : (
        <Section>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pl-1 font-medium">Página</th>
                  <th className="py-3 text-right font-medium">Sesiones</th>
                  <th className="py-3 text-right font-medium">Bounce</th>
                  <th className="py-3 text-right font-medium">Duración</th>
                  <th className="py-3 pl-4 pr-1 text-left font-medium">Señales</th>
                </tr>
              </thead>
              <tbody>
                {result.pages.map((p) => (
                  <tr
                    key={p.path}
                    className="border-b border-border/40 last:border-0 hover:bg-accent/40"
                  >
                    <td className="max-w-72 py-3 pl-1">
                      <div className="truncate font-medium text-foreground">
                        {p.title || p.path}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{p.path}</div>
                    </td>
                    <td className="tabular py-3 text-right font-medium text-foreground">
                      {p.sessions.toLocaleString("es-MX")}
                    </td>
                    <td className="tabular py-3 text-right">
                      <span
                        className={
                          p.bounce_rate >= 75
                            ? "text-status-critical"
                            : p.bounce_rate >= 55
                              ? "text-status-warning"
                              : "text-status-good"
                        }
                      >
                        {p.bounce_rate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="tabular py-3 text-right text-foreground/80">
                      {p.avg_duration.toFixed(1)}s
                    </td>
                    <td className="py-3 pl-4 pr-1">
                      <div className="flex flex-wrap gap-1">
                        {p.seo_signals.high_bounce && (
                          <Badge
                            variant="outline"
                            className="border-status-critical/40 bg-status-critical/10 text-status-critical"
                          >
                            Bounce alto
                          </Badge>
                        )}
                        {p.seo_signals.low_engagement && (
                          <Badge
                            variant="outline"
                            className="border-status-warning/40 bg-status-warning/10 text-status-warning"
                          >
                            Bajo engagement
                          </Badge>
                        )}
                        {p.seo_signals.good_landing_page && (
                          <Badge
                            variant="outline"
                            className="border-status-good/40 bg-status-good/10 text-status-good"
                          >
                            Buena landing
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

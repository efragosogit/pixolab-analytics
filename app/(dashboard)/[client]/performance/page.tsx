import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { getPagePerformance } from "@/lib/openpanel";
import { getClientConfig } from "@/lib/client-config";
import { resolveRange } from "@/lib/date-range";
import { ErrorCard, PageHeader, Section, SourceStatusBadge } from "@/components/ui-kit";
import { PerformanceTable } from "@/components/performance-table";

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
          <PerformanceTable pages={result.pages} />
        </Section>
      )}
    </div>
  );
}

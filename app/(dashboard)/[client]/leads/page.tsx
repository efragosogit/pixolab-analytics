import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { FileDownIcon, MessageSquareIcon, UsersIcon } from "lucide-react";
import { getLeadsFromDb, type LeadRecord } from "@/lib/leads-db";
import { resolveRange } from "@/lib/date-range";
import { ErrorCard, PageHeader, Section, SourceStatusBadge, StatCard } from "@/components/ui-kit";
import { LeadsTable } from "@/components/leads-table";
import type { LeadDisplay } from "@/lib/leads-types";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, LeadDisplay["source"]> = {
  form_submitted: "Formulario de contacto",
  catalog_download: "Descarga de catálogo",
};
const SOURCE_PAGE: Record<string, string> = {
  form_submitted: "/contactanos",
  catalog_download: "/catalogo-lumi",
};

function toLead(record: LeadRecord): LeadDisplay {
  return {
    id: record.id,
    name: record.name ?? "(sin nombre)",
    email: record.email ?? "—",
    phone: record.phone ?? "—",
    source: SOURCE_LABEL[record.source] ?? (record.source as LeadDisplay["source"]),
    page: record.pagePath ?? SOURCE_PAGE[record.source] ?? "—",
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

  try {
    leads = (await getLeadsFromDb(client, range)).map(toLead);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const contactCount = leads.filter((l) => l.source === "Formulario de contacto").length;
  const catalogCount = leads.filter((l) => l.source === "Descarga de catálogo").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Prospectos"
        title="Leads"
        description={`${format(parseISO(range.startDate), "d MMM", { locale: es })} — ${format(parseISO(range.endDate), "d MMM yyyy", { locale: es })}. Base de datos de leads por fuente (Postgres, Railway) — WhatsApp no está incluido aquí (sin acceso a CRM para ver esas conversaciones); para su volumen ver Conversiones. Incluye histórico importado de CF7DB desde abril 2026; los leads nuevos empezarán a llegar automáticamente una vez que este dashboard esté desplegado y el tag de GTM se actualice para mandarlos.`}
        action={<SourceStatusBadge connected={!error} />}
      />

      {error ? (
        <ErrorCard message={error} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="Total de leads"
              value={leads.length.toLocaleString("es-MX")}
              icon={<UsersIcon className="size-4" />}
              accent
            />
            <StatCard
              label="Formulario de contacto"
              value={contactCount.toLocaleString("es-MX")}
              icon={<MessageSquareIcon className="size-4" />}
            />
            <StatCard
              label="Descarga de catálogo"
              value={catalogCount.toLocaleString("es-MX")}
              icon={<FileDownIcon className="size-4" />}
            />
          </section>

          <Section title="Prospectos">
            <LeadsTable client={client} leads={leads} />
          </Section>
        </>
      )}
    </div>
  );
}

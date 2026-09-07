import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { FileDownIcon, MessageCircleIcon, MessageSquareIcon, UsersIcon } from "lucide-react";
import { getLeadsFromDb, type LeadRecord } from "@/lib/leads-db";
import { getQualifierOptions } from "@/lib/auth/users";
import { getClientConfig } from "@/lib/client-config";
import { getUniqueLeadCount } from "@/lib/openpanel";
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
  let qualifierOptions: string[] = [];

  try {
    [leads, qualifierOptions] = await Promise.all([
      getLeadsFromDb(client, range).then((rows) => rows.map(toLead)),
      getQualifierOptions(client),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // WhatsApp leads live in OpenPanel (a click event), not in this page's
  // Postgres `leads` table — there's no way to capture name/email/phone
  // for them (see the page description below), only their volume. Kept
  // in its own try/catch, separate from the main leads fetch above: a
  // client with no OpenPanel credentials yet (e.g. NUMA today) should
  // still see its real Postgres leads instead of the whole page erroring
  // out over an unrelated source. Same "unique converting people, not
  // raw click count" definition as Conversiones' WhatsApp funnel, for
  // consistency across the app — see getUniqueLeadCount's doc comment.
  let whatsappCount: number | null = null;
  try {
    const config = await getClientConfig(client);
    whatsappCount = await getUniqueLeadCount(config.openpanel, range, ["whatsapp_click"]);
  } catch {
    whatsappCount = null;
  }

  const contactCount = leads.filter((l) => l.source === "Formulario de contacto").length;
  const catalogCount = leads.filter((l) => l.source === "Descarga de catálogo").length;
  const totalCount = contactCount + catalogCount + (whatsappCount ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Prospectos"
        title="Leads"
        description={`${format(parseISO(range.startDate), "d MMM", { locale: es })} — ${format(parseISO(range.endDate), "d MMM yyyy", { locale: es })}. Formulario de contacto y descarga de catálogo vienen de Postgres (Railway), con nombre/correo/teléfono; WhatsApp viene de OpenPanel y solo aporta volumen — sin acceso al CRM no hay forma de ver esas conversaciones ni de listarlas como prospectos individuales aquí. Incluye histórico importado de CF7DB desde abril 2026.`}
        action={<SourceStatusBadge connected={!error} />}
      />

      {error ? (
        <ErrorCard message={error} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total de leads"
              value={totalCount.toLocaleString("es-MX")}
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
            <StatCard
              label="Leads de WhatsApp"
              value={whatsappCount === null ? "—" : whatsappCount.toLocaleString("es-MX")}
              icon={<MessageCircleIcon className="size-4" />}
            />
          </section>

          <Section title="Prospectos">
            <LeadsTable client={client} leads={leads} qualifierOptions={qualifierOptions} />
          </Section>
        </>
      )}
    </div>
  );
}

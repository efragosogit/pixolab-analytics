import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ExternalLinkIcon } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { canManageAccess } from "@/lib/auth/users";
import { getClientConfig, getClientRow } from "@/lib/client-config";
import {
  type IntegrationKind,
  type StoredIntegration,
  getIntegrations,
} from "@/lib/client-settings";
import { checkLeads } from "@/lib/integration-checks";
import { type GscSite, getGscServiceAccountEmail, listGscSites } from "@/lib/gsc";
import { type AdsAccount, listAdsAccounts } from "@/lib/google-ads";
import { buildLeadsSnippet } from "@/lib/leads-snippet";
import { maskSecret } from "@/lib/secrets";
import { cn } from "@/lib/utils";
import { ErrorCard, PageHeader } from "@/components/ui-kit";
import { buttonVariants } from "@/components/ui/button";
import {
  GeneralForm,
  GoogleAdsForm,
  GscForm,
  type IntegrationStatus,
  LeadsControls,
  OpenPanelForm,
  PublishControl,
  SettingsCard,
  StatusBadge,
} from "@/components/settings-forms";
import { ConversionsEditor } from "@/components/conversions-editor";

export const dynamic = "force-dynamic";

/**
 * Configuración — per-dashboard settings, staff-only (@pixolab.com.mx;
 * everyone else gets a 404, same rule as Compartir's invite/revoke, see
 * lib/auth/users.ts's `canManageAccess`). Writes go through ./actions.ts.
 *
 * The same page doubles as the new-dashboard wizard: `/nuevo` creates the
 * draft dashboard and redirects here with `?asistente=1`, which shows one
 * section at a time with a stepper and Siguiente/Omitir links (`&paso=`)
 * instead of every section stacked — same forms, no duplicated wizard UI.
 */
const STEPS = [
  { id: "general", title: "Datos generales" },
  { id: "openpanel", title: "OpenPanel" },
  { id: "gsc", title: "Search Console" },
  { id: "google_ads", title: "Google Ads" },
  { id: "leads", title: "Leads" },
  { id: "conversions", title: "Conversiones" },
  { id: "publicar", title: "Publicar" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

function statusFor(row: StoredIntegration | undefined, resolvesFromEnv: boolean): IntegrationStatus {
  if (!row) {
    return resolvesFromEnv
      ? {
          state: "env",
          message:
            "Conectado con las variables de entorno del servidor. Guarda aquí para pasarlo a la base de datos.",
          testedAt: null,
        }
      : { state: "unconfigured", message: null, testedAt: null };
  }
  if (Object.keys(row.config).length === 0) {
    return { state: "unconfigured", message: null, testedAt: null };
  }
  if (row.lastTestOk === null) {
    return { state: "pending", message: "Guardado, sin probar todavía.", testedAt: null };
  }
  return {
    state: row.lastTestOk ? "connected" : "error",
    message: row.lastTestMessage,
    testedAt: row.lastTestedAt,
  };
}

async function settle<T>(promise: Promise<T>): Promise<{ value: T | null; error: string | null }> {
  try {
    return { value: await promise, error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await params;
  const query = await searchParams;
  const user = await requireUser();
  if (!canManageAccess(user.email)) notFound();

  const row = await getClientRow(client);
  if (!row) notFound();

  const wizard = query.asistente === "1";
  const requestedStep = typeof query.paso === "string" ? query.paso : "openpanel";
  const step: StepId = STEPS.some((s) => s.id === requestedStep)
    ? (requestedStep as StepId)
    : "openpanel";
  const show = (id: StepId) => !wizard || step === id;

  let integrations: Partial<Record<IntegrationKind, StoredIntegration>>;
  let config: Awaited<ReturnType<typeof getClientConfig>>;
  try {
    [integrations, config] = await Promise.all([getIntegrations(client), getClientConfig(client)]);
  } catch (e) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Solo equipo Pixolab" title="Configuración" />
        <ErrorCard message={e instanceof Error ? e.message : String(e)} />
      </div>
    );
  }

  const [gscSites, adsAccounts, leadsCheck] = await Promise.all([
    show("gsc") ? settle<GscSite[]>(listGscSites()) : Promise.resolve({ value: [], error: null }),
    show("google_ads")
      ? settle<AdsAccount[]>(listAdsAccounts())
      : Promise.resolve({ value: [], error: null }),
    checkLeads(client),
  ]);

  const statuses: Record<IntegrationKind, IntegrationStatus> = {
    openpanel: statusFor(integrations.openpanel, Boolean(config.openpanel)),
    gsc: statusFor(integrations.gsc, Boolean(config.gscSiteUrl)),
    google_ads: statusFor(integrations.google_ads, Boolean(config.googleAdsCustomerId)),
    // Leads has nothing to test on our side — its state is simply whether
    // leads are arriving (see checkLeads).
    leads: {
      state: leadsCheck.ok ? "connected" : "pending",
      message: leadsCheck.message,
      testedAt: null,
    },
  };
  const conversionsState = config.conversions.length > 0 ? "connected" : "unconfigured";

  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const endpoint = `${appUrl}/ingest/leads/${client}`;
  const ownSecret = integrations.leads?.secrets.ingestSecret ?? null;
  const formSources = config.conversions
    .filter((c) => c.kind === "form")
    .map((c) => ({ key: c.key, label: c.label }));
  const serviceAccountEmail = getGscServiceAccountEmail();

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const prevStep = STEPS[stepIndex - 1];
  const nextStep = STEPS[stepIndex + 1];
  const stepHref = (id: StepId) => `/${client}/configuracion?asistente=1&paso=${id}`;
  const stepState = (id: StepId) =>
    id === "general"
      ? "connected"
      : id === "conversions"
        ? conversionsState
        : id === "publicar"
          ? row.isDraft
            ? "pending"
            : "connected"
          : statuses[id].state;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={wizard ? "Nuevo dashboard · asistente" : "Solo equipo Pixolab"}
        title={wizard ? `Configurar ${row.displayName}` : "Configuración"}
        description={
          wizard
            ? "Conecta cada fuente o déjala para después — todo se puede cambiar luego desde Configuración. El dashboard queda en borrador (solo lo ve Pixolab) hasta que lo publiques."
            : `Conexiones y conversiones del dashboard de ${row.displayName}. Solo el equipo de Pixolab ve esta página.`
        }
        action={
          row.isDraft ? (
            <span className="inline-flex items-center rounded-full border border-dashed border-status-warning/50 bg-status-warning/10 px-2.5 py-1 text-[11px] font-medium text-status-warning">
              Borrador
            </span>
          ) : undefined
        }
      />

      {wizard && (
        <nav className="scrollbar-none -mx-1 flex items-center gap-1 overflow-x-auto px-1">
          {STEPS.map((s, i) => {
            const active = s.id === step;
            const done = stepState(s.id) === "connected" || stepState(s.id) === "env";
            return (
              <Link
                key={s.id}
                href={stepHref(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[10px]",
                    done ? "bg-status-good/20 text-status-good" : "bg-muted",
                  )}
                >
                  {done ? <CheckIcon className="size-3" /> : i + 1}
                </span>
                {s.title}
              </Link>
            );
          })}
        </nav>
      )}

      {show("general") && (
        <SettingsCard
          id="general"
          title="Datos generales"
          description={
            <>
              Dirección del dashboard:{" "}
              <code className="font-mono text-xs text-foreground">/{client}</code> (no se puede
              cambiar).
            </>
          }
        >
          <GeneralForm client={client} displayName={row.displayName} site={row.allowedOrigin ?? ""} />
        </SettingsCard>
      )}

      {show("openpanel") && (
        <SettingsCard
          id="openpanel"
          title="OpenPanel"
          status={statuses.openpanel.state}
          description={
            <>
              Tráfico, Performance y Funnels. En{" "}
              <a
                href="https://openpanel.pixolab.com.mx"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                openpanel.pixolab.com.mx
              </a>{" "}
              abre el proyecto del cliente → Settings → Clients → Create a client, tipo{" "}
              <strong>Read</strong> (el cliente Write del snippet de rastreo no sirve para leer).
            </>
          }
        >
          <OpenPanelForm
            client={client}
            projectId={integrations.openpanel?.config.projectId ?? config.openpanel?.projectId ?? ""}
            clientId={integrations.openpanel?.config.clientId ?? config.openpanel?.clientId ?? ""}
            secretMask={maskSecret(integrations.openpanel?.secrets.clientSecret)}
            status={statuses.openpanel}
          />
        </SettingsCard>
      )}

      {show("gsc") && (
        <SettingsCard
          id="gsc"
          title="Search Console"
          status={statuses.gsc.state}
          description={
            <>
              Página SEO. El cliente debe agregar a{" "}
              <code className="font-mono text-xs text-foreground">
                {serviceAccountEmail ?? "(falta GOOGLE_SERVICE_ACCOUNT_EMAIL)"}
              </code>{" "}
              como usuario (permiso restringido basta) en su propiedad de Search Console; después
              aparece en esta lista.
            </>
          }
        >
          <GscForm
            client={client}
            siteUrl={config.gscSiteUrl ?? ""}
            sites={gscSites.value ?? []}
            sitesError={gscSites.error}
            status={statuses.gsc}
          />
        </SettingsCard>
      )}

      {show("google_ads") && (
        <SettingsCard
          id="google_ads"
          title="Google Ads"
          status={statuses.google_ads.state}
          description="Página Campañas publicitarias. Si la cuenta del cliente no aparece, pide que den acceso a la cuenta de administrador (MCC) de Pixolab."
        >
          <GoogleAdsForm
            client={client}
            customerId={config.googleAdsCustomerId ?? ""}
            accounts={adsAccounts.value ?? []}
            accountsError={adsAccounts.error}
            status={statuses.google_ads}
          />
        </SettingsCard>
      )}

      {show("leads") && (
        <SettingsCard
          id="leads"
          title="Leads"
          status={statuses.leads.state}
          description="Página Leads. El sitio del cliente manda cada formulario a este webhook con un snippet de GTM; las fuentes que acepta son los formularios configurados en Conversiones."
        >
          <LeadsControls
            client={client}
            endpoint={endpoint}
            hasOwnSecret={Boolean(ownSecret)}
            snippet={ownSecret ? buildLeadsSnippet({ endpoint, secret: ownSecret, sources: formSources }) : null}
            allowedOrigin={row.allowedOrigin}
            receivingLeads={leadsCheck.ok}
            status={statuses.leads}
          />
        </SettingsCard>
      )}

      {show("conversions") && (
        <SettingsCard
          id="conversions"
          title="Conversiones"
          status={conversionsState}
          description="Qué cuenta como lead en Funnels y Leads. Cada conversión genera su propio embudo. Los embudos especiales (varios pasos, lógica propia del cliente) se siguen haciendo a mano."
        >
          <ConversionsEditor
            client={client}
            conversions={config.conversions.map((c) => ({
              kind: c.kind,
              key: c.key,
              label: c.label,
              pagePath: c.pagePath,
            }))}
          />
        </SettingsCard>
      )}

      {show("publicar") && (
        <SettingsCard
          id="publicar"
          title={row.isDraft ? "Publicar" : "Visibilidad"}
          description={
            row.isDraft
              ? "En borrador solo lo ve el equipo de Pixolab. Al publicarlo, las personas invitadas desde Compartir ya pueden entrar."
              : "Publicado: lo ven el equipo de Pixolab y las personas invitadas desde Compartir."
          }
        >
          {wizard && (
            <ul className="flex flex-col gap-2">
              {STEPS.filter((s) => s.id !== "publicar" && s.id !== "general").map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={stepHref(s.id)} className="text-foreground hover:text-primary">
                    {s.title}
                  </Link>
                  <StatusBadge state={stepState(s.id)} />
                </li>
              ))}
            </ul>
          )}
          <PublishControl client={client} isDraft={row.isDraft} />
        </SettingsCard>
      )}

      {wizard && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {prevStep ? (
            <Link href={stepHref(prevStep.id)} className={buttonVariants({ variant: "ghost" })}>
              <ArrowLeftIcon />
              {prevStep.title}
            </Link>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/${client}/configuracion`} className={buttonVariants({ variant: "ghost" })}>
              Salir del asistente
            </Link>
            {nextStep ? (
              <Link href={stepHref(nextStep.id)} className={buttonVariants({ variant: "default" })}>
                {stepState(step) === "connected" || stepState(step) === "env"
                  ? "Siguiente"
                  : "Omitir por ahora"}
                <ArrowRightIcon />
              </Link>
            ) : (
              <Link href={`/${client}`} className={buttonVariants({ variant: "default" })}>
                Ir al dashboard
                <ExternalLinkIcon />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  ClipboardCopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlugZapIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UnplugIcon,
} from "lucide-react";
import {
  type SettingsActionResult,
  disconnectIntegrationAction,
  generateIngestSecretAction,
  listAdsAccountsAction,
  listGscSitesAction,
  saveGeneralAction,
  saveGoogleAdsAction,
  saveGscAction,
  saveOpenPanelAction,
  setPublishedAction,
  testIntegrationAction,
  revertToGlobalIngestSecretAction,
} from "@/app/(dashboard)/[client]/configuracion/actions";
import type { IntegrationKind } from "@/lib/client-settings";
import type { GscSite } from "@/lib/gsc";
import type { AdsAccount } from "@/lib/google-ads";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// --- Shared pieces ---------------------------------------------------------

export type IntegrationState = "connected" | "error" | "pending" | "unconfigured" | "env";

export interface IntegrationStatus {
  state: IntegrationState;
  message: string | null;
  testedAt: string | null;
}

const STATE_STYLE: Record<IntegrationState, { label: string; className: string; icon: ReactNode }> = {
  connected: {
    label: "Conectado",
    className: "border-status-good/30 bg-status-good/10 text-status-good",
    icon: <CheckCircle2Icon className="size-3" />,
  },
  error: {
    label: "Con error",
    className: "border-status-critical/30 bg-status-critical/10 text-status-critical",
    icon: <TriangleAlertIcon className="size-3" />,
  },
  pending: {
    label: "Sin probar",
    className: "border-status-warning/30 bg-status-warning/10 text-status-warning",
    icon: <CircleDashedIcon className="size-3" />,
  },
  unconfigured: {
    label: "Sin configurar",
    className: "border-dashed border-border bg-muted text-muted-foreground",
    icon: <CircleDashedIcon className="size-3" />,
  },
  env: {
    label: "Variables de entorno",
    className: "border-border bg-muted text-muted-foreground",
    icon: <KeyRoundIcon className="size-3" />,
  },
};

export function StatusBadge({ state }: { state: IntegrationState }) {
  const style = STATE_STYLE[state];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        style.className,
      )}
    >
      {style.icon}
      {style.label}
    </span>
  );
}

export function SettingsCard({
  id,
  title,
  description,
  status,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  status?: IntegrationState;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-40 border-border/60 bg-card/70 py-5">
      <CardContent className="flex flex-col gap-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          {status && <StatusBadge state={status} />}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  );
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

/** Last test result (from the server on load, or from the action just run) + an error/success note. */
function Feedback({
  status,
  result,
}: {
  status: IntegrationStatus | null;
  result: SettingsActionResult | null;
}) {
  if (result && !result.ok) {
    return <p className="text-xs text-status-critical">{result.error ?? "No se pudo guardar."}</p>;
  }
  const test = result?.test;
  if (test) {
    return (
      <p className={cn("text-xs", test.ok ? "text-status-good" : "text-status-critical")}>
        {test.message}
      </p>
    );
  }
  if (result?.message) return <p className="text-xs text-status-good">{result.message}</p>;
  if (status?.message) {
    return (
      <p
        className={cn(
          "text-xs",
          status.state === "connected" ? "text-muted-foreground" : "text-status-critical",
        )}
      >
        {status.message}
        {status.testedAt && (
          <span className="text-muted-foreground">
            {" "}
            · probado {dateTimeFormatter.format(new Date(status.testedAt))}
          </span>
        )}
      </p>
    );
  }
  return null;
}

/**
 * State + transition wrapper every card uses. On success it also refreshes
 * the server-rendered page (status badges, Topbar name) — safe here, unlike
 * the Compartir dialog (see share-actions.ts): these forms aren't inside a
 * dialog, and refresh() re-renders without remounting them.
 */
function useSettingsAction() {
  const router = useRouter();
  const [result, setResult] = useState<SettingsActionResult | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(name: string, action: () => Promise<SettingsActionResult>) {
    setRunning(name);
    setResult(null);
    startTransition(async () => {
      const r = await action();
      setResult(r);
      setRunning(null);
      if (r.ok) router.refresh();
    });
  }

  return { result, running, run };
}

function Spinner({ show }: { show: boolean }) {
  return show ? <Loader2Icon className="animate-spin" /> : null;
}

function TestAndDisconnect({
  client,
  kind,
  canTest,
  canDisconnect,
  running,
  run,
}: {
  client: string;
  kind: IntegrationKind;
  canTest: boolean;
  canDisconnect: boolean;
  running: string | null;
  run: (name: string, action: () => Promise<SettingsActionResult>) => void;
}) {
  return (
    <>
      {canTest && (
        <Button
          type="button"
          variant="outline"
          disabled={running !== null}
          onClick={() => run("test", () => testIntegrationAction(client, kind))}
        >
          {running === "test" ? <Spinner show /> : <PlugZapIcon />}
          Probar conexión
        </Button>
      )}
      {canDisconnect && (
        <Button
          type="button"
          variant="ghost"
          disabled={running !== null}
          onClick={() => {
            if (window.confirm("¿Desconectar esta fuente? Sus páginas dejarán de mostrar datos.")) {
              run("disconnect", () => disconnectIntegrationAction(client, kind));
            }
          }}
        >
          <UnplugIcon />
          Desconectar
        </Button>
      )}
    </>
  );
}

// --- General -----------------------------------------------------------------

export function GeneralForm({
  client,
  displayName: initialName,
  site: initialSite,
}: {
  client: string;
  displayName: string;
  site: string;
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [site, setSite] = useState(initialSite);
  const { result, running, run } = useSettingsAction();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run("save", () => saveGeneralAction(client, { displayName, site }));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del dashboard">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </Field>
        <Field
          label="Sitio web"
          hint="Se usa para el ícono del dashboard y como el único origen que puede enviar leads."
        >
          <Input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="https://cliente.com"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={running !== null}>
          <Spinner show={running === "save"} />
          Guardar
        </Button>
      </div>
      <Feedback status={null} result={result} />
    </form>
  );
}

export function PublishControl({ client, isDraft }: { client: string; isDraft: boolean }) {
  const { result, running, run } = useSettingsAction();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {isDraft ? (
          <Button
            type="button"
            disabled={running !== null}
            onClick={() => run("publish", () => setPublishedAction(client, true))}
          >
            <Spinner show={running === "publish"} />
            Publicar dashboard
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={running !== null}
            onClick={() => {
              if (
                window.confirm(
                  "¿Regresar a borrador? Las personas invitadas dejarán de ver este dashboard.",
                )
              ) {
                run("unpublish", () => setPublishedAction(client, false));
              }
            }}
          >
            <Spinner show={running === "unpublish"} />
            Regresar a borrador
          </Button>
        )}
      </div>
      <Feedback status={null} result={result} />
    </div>
  );
}

// --- OpenPanel ---------------------------------------------------------------

export function OpenPanelForm({
  client,
  projectId: initialProjectId,
  clientId: initialClientId,
  secretMask,
  status,
}: {
  client: string;
  projectId: string;
  clientId: string;
  /** "••••abcd" when a secret is stored; the secret itself never reaches the browser. */
  secretMask: string | null;
  status: IntegrationStatus;
}) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [clientId, setClientId] = useState(initialClientId);
  const [clientSecret, setClientSecret] = useState("");
  const { result, running, run } = useSettingsAction();
  const stored = status.state !== "unconfigured" && status.state !== "env";

  return (
    <form
      className="flex flex-col gap-4"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        run("save", async () => {
          const r = await saveOpenPanelAction(client, { projectId, clientId, clientSecret });
          if (r.ok) setClientSecret("");
          return r;
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="ID del proyecto" hint="El del proyecto en OpenPanel, p. ej. lumiservicios.">
          <Input value={projectId} onChange={(e) => setProjectId(e.target.value)} required />
        </Field>
        <Field label="Client ID">
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} required />
        </Field>
        <Field
          label="Client Secret"
          hint={secretMask ? `Guardado (${secretMask}). Déjalo vacío para conservarlo.` : undefined}
        >
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={secretMask ?? ""}
            required={!secretMask}
            autoComplete="new-password"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={running !== null}>
          <Spinner show={running === "save"} />
          Guardar y probar
        </Button>
        <TestAndDisconnect
          client={client}
          kind="openpanel"
          canTest={status.state !== "unconfigured"}
          canDisconnect={stored}
          running={running}
          run={run}
        />
      </div>
      <Feedback status={status} result={result} />
    </form>
  );
}

// --- Search Console ----------------------------------------------------------

export function GscForm({
  client,
  siteUrl: initialSiteUrl,
  sites: initialSites,
  sitesError: initialSitesError,
  status,
}: {
  client: string;
  siteUrl: string;
  sites: GscSite[];
  sitesError: string | null;
  status: IntegrationStatus;
}) {
  const [siteUrl, setSiteUrl] = useState(initialSiteUrl);
  const [sites, setSites] = useState(initialSites);
  const [sitesError, setSitesError] = useState(initialSitesError);
  const [reloading, startReload] = useTransition();
  const { result, running, run } = useSettingsAction();
  const stored = status.state !== "unconfigured" && status.state !== "env";
  // Keep the current value selectable even if it isn't in the list (e.g.
  // access was removed in Search Console) so the select never goes blank.
  const options =
    siteUrl && !sites.some((s) => s.siteUrl === siteUrl)
      ? [{ siteUrl, permissionLevel: "sin acceso" }, ...sites]
      : sites;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run("save", () => saveGscAction(client, { siteUrl }));
      }}
    >
      <Field
        label="Propiedad de Search Console"
        hint={
          sitesError
            ? `No se pudo cargar la lista: ${sitesError}`
            : options.length === 0
              ? "La cuenta de servicio todavía no tiene acceso a ninguna propiedad."
              : undefined
        }
      >
        <div className="flex gap-2">
          <Select value={siteUrl} onValueChange={(v) => setSiteUrl(v ?? "")}>
            <SelectTrigger className="w-full min-w-0">
              <SelectValue placeholder="Elige una propiedad" />
            </SelectTrigger>
            <SelectContent>
              {options.map((s) => (
                <SelectItem key={s.siteUrl} value={s.siteUrl}>
                  {s.siteUrl}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Recargar propiedades"
            disabled={reloading}
            onClick={() =>
              startReload(async () => {
                const r = await listGscSitesAction(client);
                if (r.ok) {
                  setSites(r.sites ?? []);
                  setSitesError(null);
                } else {
                  setSitesError(r.error ?? "Error desconocido");
                }
              })
            }
          >
            <RefreshCwIcon className={cn(reloading && "animate-spin")} />
          </Button>
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={running !== null || !siteUrl}>
          <Spinner show={running === "save"} />
          Guardar y probar
        </Button>
        <TestAndDisconnect
          client={client}
          kind="gsc"
          canTest={status.state !== "unconfigured"}
          canDisconnect={stored}
          running={running}
          run={run}
        />
      </div>
      <Feedback status={status} result={result} />
    </form>
  );
}

// --- Google Ads --------------------------------------------------------------

function formatCustomerId(id: string) {
  return id.length === 10 ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id;
}

export function GoogleAdsForm({
  client,
  customerId: initialCustomerId,
  accounts: initialAccounts,
  accountsError: initialAccountsError,
  status,
}: {
  client: string;
  customerId: string;
  accounts: AdsAccount[];
  accountsError: string | null;
  status: IntegrationStatus;
}) {
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountsError, setAccountsError] = useState(initialAccountsError);
  const [reloading, startReload] = useTransition();
  const { result, running, run } = useSettingsAction();
  const stored = status.state !== "unconfigured" && status.state !== "env";
  const options =
    customerId && !accounts.some((a) => a.customerId === customerId)
      ? [{ customerId, name: null, isManager: false }, ...accounts]
      : accounts;
  const labelFor = (a: AdsAccount) =>
    `${a.name ?? "Cuenta sin nombre"} · ${formatCustomerId(a.customerId)}${a.isManager ? " (administrador)" : ""}`;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run("save", () => saveGoogleAdsAction(client, { customerId }));
      }}
    >
      <Field
        label="Cuenta de Google Ads"
        hint={
          accountsError
            ? `No se pudo cargar la lista: ${accountsError}`
            : "Cuentas a las que llega el acceso de Pixolab. Elige la del anunciante, no una de administrador."
        }
      >
        <div className="flex gap-2">
          <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
            <SelectTrigger className="w-full min-w-0">
              <SelectValue placeholder="Elige una cuenta">
                {(value: string | null) => {
                  const account = options.find((a) => a.customerId === value);
                  return account ? labelFor(account) : "Elige una cuenta";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((a) => (
                <SelectItem key={a.customerId} value={a.customerId}>
                  {labelFor(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Recargar cuentas"
            disabled={reloading}
            onClick={() =>
              startReload(async () => {
                const r = await listAdsAccountsAction(client);
                if (r.ok) {
                  setAccounts(r.accounts ?? []);
                  setAccountsError(null);
                } else {
                  setAccountsError(r.error ?? "Error desconocido");
                }
              })
            }
          >
            <RefreshCwIcon className={cn(reloading && "animate-spin")} />
          </Button>
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={running !== null || !customerId}>
          <Spinner show={running === "save"} />
          Guardar y probar
        </Button>
        <TestAndDisconnect
          client={client}
          kind="google_ads"
          canTest={status.state !== "unconfigured"}
          canDisconnect={stored}
          running={running}
          run={run}
        />
      </div>
      <Feedback status={status} result={result} />
    </form>
  );
}

// --- Leads -------------------------------------------------------------------

export function LeadsControls({
  client,
  endpoint,
  hasOwnSecret,
  snippet,
  allowedOrigin,
  receivingLeads,
  status,
}: {
  client: string;
  endpoint: string;
  hasOwnSecret: boolean;
  /** Built server-side only when the client has its own secret. */
  snippet: string | null;
  allowedOrigin: string | null;
  receivingLeads: boolean;
  status: IntegrationStatus;
}) {
  const { result, running, run } = useSettingsAction();
  const [copied, setCopied] = useState(false);

  function generate() {
    if (
      receivingLeads &&
      !window.confirm(
        hasOwnSecret
          ? "Generar un secreto nuevo invalida el actual: los leads dejarán de llegar hasta que actualices el snippet en GTM. ¿Continuar?"
          : "Este dashboard ya recibe leads con el secreto global. Si generas uno propio, los leads dejarán de llegar hasta que actualices el snippet en GTM. ¿Continuar?",
      )
    ) {
      return;
    }
    run("generate", () => generateIngestSecretAction(client));
  }

  return (
    <div className="flex flex-col gap-4">
      {!allowedOrigin && (
        <p className="rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
          Falta el sitio web en la sección General: sin él, el webhook rechaza todos los leads.
        </p>
      )}

      <Field label="Webhook">
        <code className="block overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
          POST {endpoint}
        </code>
      </Field>

      {snippet ? (
        <Field
          label="Snippet para GTM"
          hint="Etiqueta HTML personalizada, activador: All Pages. Para Contact Form 7, reemplaza cada ID_FORMULARIO_N por el ID del formulario en WordPress."
        >
          <div className="relative">
            <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
              {snippet}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={async () => {
                await navigator.clipboard.writeText(snippet);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <ClipboardCopyIcon />
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">
          Este dashboard usa el secreto global de leads (el que ya tiene el GTM del sitio, si
          existe). Genera un secreto propio para obtener el snippet listo para pegar.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={running !== null} onClick={generate}>
          <Spinner show={running === "generate"} />
          <KeyRoundIcon />
          {hasOwnSecret ? "Generar secreto nuevo" : "Generar secreto propio"}
        </Button>
        {hasOwnSecret && (
          <Button
            type="button"
            variant="ghost"
            disabled={running !== null}
            onClick={() => {
              if (
                window.confirm(
                  "¿Volver al secreto global? El snippet actual dejará de funcionar si el GTM del sitio usa el secreto propio.",
                )
              ) {
                run("global", () => revertToGlobalIngestSecretAction(client));
              }
            }}
          >
            Usar secreto global
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={running !== null}
          onClick={() => run("test", () => testIntegrationAction(client, "leads"))}
        >
          {running === "test" ? <Spinner show /> : <PlugZapIcon />}
          Revisar leads recibidos
        </Button>
      </div>
      <Feedback status={status} result={result} />
    </div>
  );
}

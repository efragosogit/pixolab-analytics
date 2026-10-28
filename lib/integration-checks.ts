/**
 * "Probar conexión" for each integration on the Configuración page — one
 * real, cheap query per source, so a saved setting is only shown as
 * connected once it has actually returned data. Each check returns a short
 * Spanish message the UI shows as-is (and that gets stored in
 * `client_integrations.last_test_message`).
 *
 * Server-only. Never import from a Client Component.
 */
import { getPool } from "./db";
import { getAdsOverview } from "./google-ads";
import { getSeoOverview } from "./gsc";
import type { DateRange, OpenPanelCreds } from "./openpanel";

export interface CheckResult {
  ok: boolean;
  message: string;
}

function lastDays(n: number): DateRange {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (n - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function errorMessage(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}

/**
 * Hits `/overview` directly with `cache: "no-store"` instead of going
 * through lib/openpanel.ts's `getOverview`, which caches for 5 minutes —
 * a test right after fixing a wrong secret must not get a cached answer.
 */
export async function checkOpenPanel(creds: OpenPanelCreds): Promise<CheckResult> {
  const apiUrl = process.env.OPENPANEL_API_URL;
  if (!apiUrl) return { ok: false, message: "Falta OPENPANEL_API_URL en el servidor." };
  const range = lastDays(7);
  // Half-open range on this API — see toApiParams in lib/openpanel.ts.
  const end = new Date(`${range.endDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const url = `${apiUrl}/insights/${encodeURIComponent(creds.projectId)}/overview?startDate=${range.startDate}&endDate=${end.toISOString().slice(0, 10)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "openpanel-client-id": creds.clientId,
        "openpanel-client-secret": creds.clientSecret,
      },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: "OpenPanel rechazó las credenciales. Revisa que el cliente sea tipo Read y que el secreto sea correcto.",
      };
    }
    if (res.status === 404) {
      return { ok: false, message: `OpenPanel no encontró el proyecto "${creds.projectId}".` };
    }
    if (!res.ok) {
      return { ok: false, message: `OpenPanel respondió ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const body = (await res.json()) as { summary?: { unique_visitors?: number } };
    const visitors = body.summary?.unique_visitors ?? 0;
    return {
      ok: true,
      message: `Conectado: ${visitors.toLocaleString("es-MX")} visitantes en los últimos 7 días.`,
    };
  } catch (e) {
    return { ok: false, message: `No se pudo contactar a OpenPanel: ${errorMessage(e)}` };
  }
}

export async function checkGsc(siteUrl: string): Promise<CheckResult> {
  try {
    const overview = await getSeoOverview(siteUrl, lastDays(28));
    return {
      ok: true,
      message: `Conectado: ${overview.clicks.toLocaleString("es-MX")} clics y ${overview.impressions.toLocaleString("es-MX")} impresiones en los últimos 28 días.`,
    };
  } catch (e) {
    const msg = errorMessage(e);
    if (/permission|403|not have/i.test(msg)) {
      return {
        ok: false,
        message: "La cuenta de servicio no tiene acceso a esa propiedad. Agrégala como usuario en Search Console.",
      };
    }
    return { ok: false, message: `Search Console respondió con error: ${msg}` };
  }
}

export async function checkGoogleAds(customerId: string): Promise<CheckResult> {
  try {
    const overview = await getAdsOverview(customerId, lastDays(30));
    const spend = overview.spend.toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    });
    return {
      ok: true,
      message: `Conectado: ${spend} de gasto y ${overview.conversions.toLocaleString("es-MX")} conversiones en los últimos 30 días.`,
    };
  } catch (e) {
    return { ok: false, message: `Google Ads respondió con error: ${errorMessage(e)}` };
  }
}

/**
 * Leads have nothing to "connect" on our side — the client's site posts to
 * the webhook. So the check reports whether leads are actually arriving.
 * No leads yet is not a failure of the setting itself, but it's reported
 * as not-ok so the card keeps saying "esperando el primer lead".
 */
export async function checkLeads(client: string): Promise<CheckResult> {
  const { rows } = await getPool().query<{ total: number; recent: number; last: Date | null }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS recent,
            max(created_at) AS last
     FROM leads WHERE client = $1`,
    [client],
  );
  const { total, recent, last } = rows[0] ?? { total: 0, recent: 0, last: null };
  if (!last) {
    return { ok: false, message: "Todavía no llega ningún lead. Esperando el primero desde el sitio." };
  }
  const when = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(last);
  return {
    ok: true,
    message: `Recibiendo leads: ${recent.toLocaleString("es-MX")} en los últimos 30 días (${total.toLocaleString("es-MX")} en total). Último: ${when}`,
  };
}

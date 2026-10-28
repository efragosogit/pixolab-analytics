"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { canManageAccess } from "@/lib/auth/users";
import { getClientConfig, getClientRow } from "@/lib/client-config";
import {
  type IntegrationKind,
  clearIntegration,
  getIntegrations,
  normalizeOrigin,
  recordIntegrationTest,
  replaceConversions,
  saveIntegration,
  setClientDraft,
  updateClientGeneral,
} from "@/lib/client-settings";
import { fetchFaviconDataUrl } from "@/lib/favicon";
import {
  type CheckResult,
  checkGoogleAds,
  checkGsc,
  checkLeads,
  checkOpenPanel,
} from "@/lib/integration-checks";
import { type GscSite, listGscSites } from "@/lib/gsc";
import { type AdsAccount, listAdsAccounts } from "@/lib/google-ads";

export interface SettingsActionResult {
  ok: boolean;
  /** Shown to the user — a success note or the test result. */
  message?: string;
  error?: string;
  /** Result of the connection test run right after saving, when there is one. */
  test?: CheckResult;
}

/**
 * Every action here is staff-only (@pixolab.com.mx — the same rule as the
 * Compartir modal, see lib/auth/users.ts's `canManageAccess`) and
 * independently re-checks it; the Configuración page itself 404s for
 * anyone else, but a Server Action is its own public endpoint.
 *
 * requireUser() can call redirect(), which throws a special Next.js signal
 * — kept outside every try/catch below so a generic catch doesn't swallow
 * it (same rule as share-actions.ts).
 *
 * Secrets: actions receive a pasted secret and write it straight to
 * lib/client-settings.ts (encrypted there); none of them ever returns a
 * secret back to the browser.
 */
async function guard(client: string): Promise<{ email: string } | SettingsActionResult> {
  const user = await requireUser();
  if (!canManageAccess(user.email)) {
    return { ok: false, error: "Solo el equipo de Pixolab puede configurar dashboards." };
  }
  const row = await getClientRow(client);
  if (!row) return { ok: false, error: `No existe el dashboard "${client}".` };
  return { email: user.email };
}

function isFailure(g: { email: string } | SettingsActionResult): g is SettingsActionResult {
  return "ok" in g;
}

function fail(e: unknown): SettingsActionResult {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

async function runCheck(client: string, kind: IntegrationKind): Promise<CheckResult> {
  // React.cache is per-request, and each Server Action call is its own
  // request — this always reads what was just saved.
  const config = await getClientConfig(client);
  let result: CheckResult;
  switch (kind) {
    case "openpanel":
      result = config.openpanel
        ? await checkOpenPanel(config.openpanel)
        : { ok: false, message: "Faltan datos de OpenPanel." };
      break;
    case "gsc":
      result = config.gscSiteUrl
        ? await checkGsc(config.gscSiteUrl)
        : { ok: false, message: "Elige una propiedad de Search Console." };
      break;
    case "google_ads":
      result = config.googleAdsCustomerId
        ? await checkGoogleAds(config.googleAdsCustomerId)
        : { ok: false, message: "Elige una cuenta de Google Ads." };
      break;
    case "leads":
      result = await checkLeads(client);
      break;
  }
  // Only rows stored in the DB keep a test history; a client still running
  // on env-var fallback just gets the live result.
  if ((await getIntegrations(client))[kind]) {
    await recordIntegrationTest(client, kind, result.ok, result.message);
  }
  return result;
}

// --- General -------------------------------------------------------------

const generalSchema = z.object({
  displayName: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(80),
  site: z.string().trim().max(200),
});

export async function saveGeneralAction(
  client: string,
  input: { displayName: string; site: string },
): Promise<SettingsActionResult> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  const parsed = generalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const origin = parsed.data.site ? normalizeOrigin(parsed.data.site) : null;
  if (parsed.data.site && !origin) {
    return { ok: false, error: "El sitio web no es una dirección válida (p. ej. https://cliente.com)." };
  }

  try {
    const row = await getClientRow(client);
    // Re-fetch the favicon only when the domain actually changed (or there
    // was none) — never overwrite a hand-placed one (e.g. Lumiservicios'
    // /lumiservicios-favicon.png) just because the name was edited.
    const domainChanged = origin !== row?.allowedOrigin;
    const faviconPath =
      origin && (domainChanged || !row?.faviconPath) ? await fetchFaviconDataUrl(origin) : undefined;
    await updateClientGeneral(client, {
      displayName: parsed.data.displayName,
      allowedOrigin: origin,
      faviconPath: faviconPath ?? undefined,
    });
    return { ok: true, message: "Guardado." };
  } catch (e) {
    return fail(e);
  }
}

export async function setPublishedAction(
  client: string,
  published: boolean,
): Promise<SettingsActionResult> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  try {
    await setClientDraft(client, !published);
    return {
      ok: true,
      message: published
        ? "Dashboard publicado: las personas invitadas ya pueden verlo."
        : "Dashboard en borrador: solo el equipo de Pixolab puede verlo.",
    };
  } catch (e) {
    return fail(e);
  }
}

// --- OpenPanel -----------------------------------------------------------

const openPanelSchema = z.object({
  projectId: z.string().trim().min(1, "Falta el ID del proyecto.").max(100),
  clientId: z.string().trim().min(1, "Falta el Client ID.").max(200),
  clientSecret: z.string().max(500),
});

export async function saveOpenPanelAction(
  client: string,
  input: { projectId: string; clientId: string; clientSecret: string },
): Promise<SettingsActionResult> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  const parsed = openPanelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  try {
    const existing = (await getIntegrations(client)).openpanel;
    if (!parsed.data.clientSecret.trim() && !existing?.secrets.clientSecret) {
      return { ok: false, error: "Falta el Client Secret." };
    }
    await saveIntegration(client, "openpanel", {
      config: { projectId: parsed.data.projectId, clientId: parsed.data.clientId },
      secrets: { clientSecret: parsed.data.clientSecret },
      updatedBy: g.email,
    });
    return { ok: true, test: await runCheck(client, "openpanel") };
  } catch (e) {
    return fail(e);
  }
}

// --- Search Console ------------------------------------------------------

export async function listGscSitesAction(
  client: string,
): Promise<{ ok: boolean; sites?: GscSite[]; error?: string }> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  try {
    return { ok: true, sites: await listGscSites() };
  } catch (e) {
    return fail(e);
  }
}

export async function saveGscAction(
  client: string,
  input: { siteUrl: string },
): Promise<SettingsActionResult> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  const siteUrl = input.siteUrl.trim();
  if (!siteUrl) return { ok: false, error: "Elige una propiedad." };
  try {
    await saveIntegration(client, "gsc", { config: { siteUrl }, updatedBy: g.email });
    return { ok: true, test: await runCheck(client, "gsc") };
  } catch (e) {
    return fail(e);
  }
}

// --- Google Ads ----------------------------------------------------------

export async function listAdsAccountsAction(
  client: string,
): Promise<{ ok: boolean; accounts?: AdsAccount[]; error?: string }> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  try {
    return { ok: true, accounts: await listAdsAccounts() };
  } catch (e) {
    return fail(e);
  }
}

export async function saveGoogleAdsAction(
  client: string,
  input: { customerId: string },
): Promise<SettingsActionResult> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  const customerId = input.customerId.replace(/\D/g, "");
  if (customerId.length < 6) return { ok: false, error: "Elige una cuenta de Google Ads." };
  try {
    await saveIntegration(client, "google_ads", { config: { customerId }, updatedBy: g.email });
    return { ok: true, test: await runCheck(client, "google_ads") };
  } catch (e) {
    return fail(e);
  }
}

// --- Leads ---------------------------------------------------------------

/**
 * Creates (or rotates) this client's own ingest secret. Rotating breaks
 * the site's current GTM tag until it's updated with the new value — the
 * UI asks for confirmation before calling this on a client that's already
 * receiving leads.
 */
export async function generateIngestSecretAction(client: string): Promise<SettingsActionResult> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  try {
    const existing = (await getIntegrations(client)).leads;
    await saveIntegration(client, "leads", {
      config: existing?.config ?? {},
      secrets: { ingestSecret: randomBytes(24).toString("hex") },
      updatedBy: g.email,
    });
    return { ok: true, message: "Secreto nuevo generado. Actualiza el snippet en GTM." };
  } catch (e) {
    return fail(e);
  }
}

/** Drops the client's own secret — the webhook falls back to the global LEADS_INGEST_SECRET. */
export async function revertToGlobalIngestSecretAction(client: string): Promise<SettingsActionResult> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  try {
    const existing = (await getIntegrations(client)).leads;
    if (existing) {
      await saveIntegration(client, "leads", {
        config: existing.config,
        secrets: { ingestSecret: null },
        updatedBy: g.email,
      });
    }
    return { ok: true, message: "Este dashboard vuelve a usar el secreto global." };
  } catch (e) {
    return fail(e);
  }
}

// --- Conversions ---------------------------------------------------------

const conversionsSchema = z
  .array(
    z.object({
      kind: z.enum(["event", "form"]),
      key: z
        .string()
        .trim()
        .regex(/^[a-z0-9_]{1,60}$/, "La clave solo admite minúsculas, números y guion bajo (p. ej. whatsapp_click)."),
      label: z.string().trim().min(1, "Cada conversión necesita un nombre.").max(60),
      pagePath: z
        .string()
        .trim()
        .max(300)
        .nullable()
        .transform((v) => (v ? (v.startsWith("/") ? v : `/${v}`) : null)),
    }),
  )
  .max(12, "Máximo 12 conversiones.")
  .refine((list) => new Set(list.map((c) => c.key)).size === list.length, {
    message: "Hay dos conversiones con la misma clave.",
  });

export async function saveConversionsAction(
  client: string,
  input: { kind: "event" | "form"; key: string; label: string; pagePath: string | null }[],
): Promise<SettingsActionResult> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  const parsed = conversionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    await replaceConversions(client, parsed.data);
    return { ok: true, message: "Conversiones guardadas." };
  } catch (e) {
    return fail(e);
  }
}

// --- Shared --------------------------------------------------------------

export async function testIntegrationAction(
  client: string,
  kind: IntegrationKind,
): Promise<SettingsActionResult> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  try {
    return { ok: true, test: await runCheck(client, kind) };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectIntegrationAction(
  client: string,
  kind: IntegrationKind,
): Promise<SettingsActionResult> {
  const g = await guard(client);
  if (isFailure(g)) return g;
  try {
    await clearIntegration(client, kind, g.email);
    return { ok: true, message: "Desconectado." };
  } catch (e) {
    return fail(e);
  }
}

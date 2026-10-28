/**
 * Multi-tenant config resolver — turns a `client` URL segment (e.g.
 * "lumiservicios") into everything a page needs to fetch that client's
 * data: its `clients` row (display name, favicon), its per-integration
 * settings and its conversions. Every page under `app/(dashboard)/[client]/`
 * calls `getClientConfig(client)` instead of any lib file reading
 * per-client settings directly — see `lib/openpanel.ts`, `lib/gsc.ts`,
 * `lib/google-ads.ts`, `lib/leads-db.ts`, all of which take their
 * per-client identifier as an explicit argument.
 *
 * Where settings come from (since 2026-10-28, 006_client_settings.sql):
 * the `client_integrations` table first, written by each dashboard's
 * Configuración page / the new-dashboard wizard. If a client has no row
 * for an integration, the old `CLIENT_<SLUG>_*` env vars are still read as
 * a fallback (that's how Lumiservicios worked before; see
 * scripts/seed-client-integrations.mjs to move a client's env vars into
 * the DB). Every integration is optional: a missing one resolves to `null`
 * and the page renders a "no conectado" state (components/not-connected.tsx)
 * instead of erroring.
 *
 * `getClientConfig` is `React.cache()`-scoped — de-duped per request, not
 * a cross-request singleton (unlike `lib/db.ts`'s Postgres pool, which
 * correctly stays a real singleton — config is per-request-per-client by
 * nature, a pool connection isn't).
 *
 * Server-only. Never import from a Client Component.
 */
import { cache } from "react";
import { getPool } from "./db";
import type { OpenPanelCreds } from "./openpanel";
import {
  type Conversion,
  type StoredIntegration,
  getIntegrations,
  listConversions,
} from "./client-settings";

export type { Conversion };

export interface ClientRow {
  slug: string;
  displayName: string;
  faviconPath: string | null;
  active: boolean;
  allowedOrigin: string | null;
  /** Created from the wizard and not published yet — only staff can see it. */
  isDraft: boolean;
}

interface ClientTableRow {
  slug: string;
  display_name: string;
  favicon_path: string | null;
  active: boolean;
  allowed_origin: string | null;
  is_draft: boolean;
}

export const CLIENT_COLUMNS = "slug, display_name, favicon_path, active, allowed_origin, is_draft";

export function toClientRow(r: ClientTableRow): ClientRow {
  return {
    slug: r.slug,
    displayName: r.display_name,
    faviconPath: r.favicon_path,
    active: r.active,
    allowedOrigin: r.allowed_origin,
    isDraft: r.is_draft,
  };
}

export async function getClientRow(slug: string): Promise<ClientRow | null> {
  const { rows } = await getPool().query<ClientTableRow>(
    `SELECT ${CLIENT_COLUMNS} FROM clients WHERE slug = $1`,
    [slug],
  );
  return rows[0] ? toClientRow(rows[0]) : null;
}

/**
 * Every active tenant, drafts included — used by the post-login picker for
 * staff (who see all of them, drafts flagged). Non-staff go through
 * `getAccessibleClients` in lib/auth/users.ts, which never returns drafts.
 */
export async function listActiveClients(): Promise<ClientRow[]> {
  const { rows } = await getPool().query<ClientTableRow>(
    `SELECT ${CLIENT_COLUMNS} FROM clients WHERE active ORDER BY is_draft ASC, display_name ASC`,
  );
  return rows.map(toClientRow);
}

export interface ClientConfig {
  slug: string;
  displayName: string;
  faviconPath: string | null;
  allowedOrigin: string | null;
  isDraft: boolean;
  /** null = OpenPanel not connected for this client. */
  openpanel: OpenPanelCreds | null;
  /** null = Search Console not connected. */
  gscSiteUrl: string | null;
  /** null = Google Ads not connected. */
  googleAdsCustomerId: string | null;
  /**
   * The secret the leads webhook expects in `x-ingest-secret`. null = no
   * per-client secret set; the webhook then falls back to the global
   * LEADS_INGEST_SECRET (what Lumiservicios' live GTM tag still sends).
   */
  leadsIngestSecret: string | null;
  conversions: Conversion[];
}

/** "lumiservicios" -> "LUMISERVICIOS", "acme-co" -> "ACME_CO" (env var names can't have hyphens). */
function envPrefix(slug: string): string {
  return slug.toUpperCase().replace(/-/g, "_");
}

function env(name: string): string | null {
  return process.env[name] || null;
}

function resolveOpenPanel(slug: string, row: StoredIntegration | undefined): OpenPanelCreds | null {
  if (row) {
    const { clientId, projectId } = row.config;
    const { clientSecret } = row.secrets;
    return clientId && projectId && clientSecret ? { clientId, clientSecret, projectId } : null;
  }
  const prefix = envPrefix(slug);
  const clientId = env(`CLIENT_${prefix}_OPENPANEL_CLIENT_ID`);
  const clientSecret = env(`CLIENT_${prefix}_OPENPANEL_CLIENT_SECRET`);
  const projectId = env(`CLIENT_${prefix}_OPENPANEL_PROJECT_ID`);
  return clientId && clientSecret && projectId ? { clientId, clientSecret, projectId } : null;
}

export const getClientConfig = cache(async (slug: string): Promise<ClientConfig> => {
  const row = await getClientRow(slug);
  if (!row || !row.active) {
    throw new Error(`Unknown or inactive client "${slug}".`);
  }

  const [integrations, conversions] = await Promise.all([
    getIntegrations(slug),
    listConversions(slug),
  ]);
  const prefix = envPrefix(slug);

  return {
    slug: row.slug,
    displayName: row.displayName,
    faviconPath: row.faviconPath,
    allowedOrigin: row.allowedOrigin,
    isDraft: row.isDraft,
    openpanel: resolveOpenPanel(slug, integrations.openpanel),
    gscSiteUrl: integrations.gsc
      ? integrations.gsc.config.siteUrl || null
      : env(`CLIENT_${prefix}_GSC_SITE_URL`),
    googleAdsCustomerId: integrations.google_ads
      ? integrations.google_ads.config.customerId || null
      : env(`CLIENT_${prefix}_GOOGLE_ADS_CUSTOMER_ID`),
    leadsIngestSecret: integrations.leads?.secrets.ingestSecret ?? null,
    conversions,
  };
});

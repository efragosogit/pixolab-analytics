/**
 * Multi-tenant config resolver — turns a `client` URL segment (e.g.
 * "lumiservicios") into everything a page needs to fetch that client's
 * data: its `clients` row (display name, favicon) plus its per-integration
 * credentials, read from `CLIENT_<SLUG>_*` env vars (see
 * `.env.local.example`). Every page under `app/(dashboard)/[client]/`
 * calls `getClientConfig(client)` instead of any lib file reading a
 * per-client env var directly — see `lib/openpanel.ts`, `lib/gsc.ts`,
 * `lib/google-ads.ts`, `lib/leads-db.ts`, all of which now take their
 * per-client identifier as an explicit argument.
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

export interface ClientRow {
  slug: string;
  displayName: string;
  faviconPath: string | null;
  active: boolean;
  allowedOrigin: string | null;
}

interface ClientTableRow {
  slug: string;
  display_name: string;
  favicon_path: string | null;
  active: boolean;
  allowed_origin: string | null;
}

function toClientRow(r: ClientTableRow): ClientRow {
  return {
    slug: r.slug,
    displayName: r.display_name,
    faviconPath: r.favicon_path,
    active: r.active,
    allowedOrigin: r.allowed_origin,
  };
}

export async function getClientRow(slug: string): Promise<ClientRow | null> {
  const { rows } = await getPool().query<ClientTableRow>(
    `SELECT slug, display_name, favicon_path, active, allowed_origin FROM clients WHERE slug = $1`,
    [slug],
  );
  return rows[0] ? toClientRow(rows[0]) : null;
}

/** Every active tenant — used by the post-login picker for staff (who see all of them). */
export async function listActiveClients(): Promise<ClientRow[]> {
  const { rows } = await getPool().query<ClientTableRow>(
    `SELECT slug, display_name, favicon_path, active, allowed_origin FROM clients WHERE active ORDER BY display_name ASC`,
  );
  return rows.map(toClientRow);
}

export interface ClientConfig {
  slug: string;
  displayName: string;
  faviconPath: string | null;
  openpanel: OpenPanelCreds;
  gscSiteUrl: string;
  googleAdsCustomerId: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name} — copy .env.local.example to .env.local and fill in this client's config.`,
    );
  }
  return value;
}

/** "lumiservicios" -> "LUMISERVICIOS", "acme-co" -> "ACME_CO" (env var names can't have hyphens). */
function envPrefix(slug: string): string {
  return slug.toUpperCase().replace(/-/g, "_");
}

export const getClientConfig = cache(async (slug: string): Promise<ClientConfig> => {
  const row = await getClientRow(slug);
  if (!row || !row.active) {
    throw new Error(`Unknown or inactive client "${slug}".`);
  }

  const prefix = envPrefix(slug);
  return {
    slug: row.slug,
    displayName: row.displayName,
    faviconPath: row.faviconPath,
    openpanel: {
      clientId: requiredEnv(`CLIENT_${prefix}_OPENPANEL_CLIENT_ID`),
      clientSecret: requiredEnv(`CLIENT_${prefix}_OPENPANEL_CLIENT_SECRET`),
      projectId: requiredEnv(`CLIENT_${prefix}_OPENPANEL_PROJECT_ID`),
    },
    gscSiteUrl: requiredEnv(`CLIENT_${prefix}_GSC_SITE_URL`),
    googleAdsCustomerId: requiredEnv(`CLIENT_${prefix}_GOOGLE_ADS_CUSTOMER_ID`),
  };
});

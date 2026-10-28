/**
 * Reads/writes per-client integration settings and conversions — the
 * `client_integrations` / `client_conversions` tables from
 * db/migrations/006_client_settings.sql. `lib/client-config.ts` is the
 * read side every page uses; this file is the storage layer underneath it
 * plus the write side used by the Configuración page and the new-dashboard
 * wizard (app/(dashboard)/[client]/configuracion/actions.ts).
 *
 * Secret fields go in and out of here already decrypted — encryption
 * happens only at this boundary (lib/secrets.ts), so nothing else ever
 * handles ciphertext. Callers must still never send a secret to the
 * browser: the Configuración UI only ever gets `maskSecret(...)`.
 *
 * Server-only. Never import from a Client Component.
 */
import { getPool } from "./db";
import { decryptSecretFields, encryptSecretFields } from "./secrets";

export const INTEGRATION_KINDS = ["openpanel", "gsc", "google_ads", "leads"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export interface StoredIntegration {
  kind: IntegrationKind;
  config: Record<string, string>;
  secrets: Record<string, string>;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  lastTestedAt: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

interface IntegrationTableRow {
  kind: IntegrationKind;
  config: Record<string, unknown> | null;
  secret_ciphertext: string | null;
  last_test_ok: boolean | null;
  last_test_message: string | null;
  last_tested_at: Date | null;
  updated_by: string | null;
  updated_at: Date;
}

function stringFields(obj: Record<string, unknown> | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function toStored(r: IntegrationTableRow): StoredIntegration {
  return {
    kind: r.kind,
    config: stringFields(r.config),
    secrets: decryptSecretFields(r.secret_ciphertext),
    lastTestOk: r.last_test_ok,
    lastTestMessage: r.last_test_message,
    lastTestedAt: r.last_tested_at ? r.last_tested_at.toISOString() : null,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function getIntegrations(
  client: string,
): Promise<Partial<Record<IntegrationKind, StoredIntegration>>> {
  const { rows } = await getPool().query<IntegrationTableRow>(
    `SELECT kind, config, secret_ciphertext, last_test_ok, last_test_message, last_tested_at,
            updated_by, updated_at
     FROM client_integrations WHERE client = $1`,
    [client],
  );
  const out: Partial<Record<IntegrationKind, StoredIntegration>> = {};
  for (const row of rows) out[row.kind] = toStored(row);
  return out;
}

/**
 * Upserts one integration. `secrets` is a *patch*: a field left out (or
 * sent empty) keeps its stored value, so the UI can resave the non-secret
 * fields without ever having the secret in hand. Pass `null` for a field
 * to clear it. Resets the last test result — the config changed, the old
 * result no longer describes it.
 */
export async function saveIntegration(
  client: string,
  kind: IntegrationKind,
  input: {
    config: Record<string, string>;
    secrets?: Record<string, string | null>;
    updatedBy: string;
  },
): Promise<void> {
  const existing = (await getIntegrations(client))[kind];
  const secrets: Record<string, string> = { ...(existing?.secrets ?? {}) };
  for (const [key, value] of Object.entries(input.secrets ?? {})) {
    if (value === null) delete secrets[key];
    else if (value.trim() !== "") secrets[key] = value.trim();
  }
  const ciphertext = Object.keys(secrets).length > 0 ? encryptSecretFields(secrets) : null;

  await getPool().query(
    `INSERT INTO client_integrations (client, kind, config, secret_ciphertext, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (client, kind) DO UPDATE
       SET config = EXCLUDED.config,
           secret_ciphertext = EXCLUDED.secret_ciphertext,
           updated_by = EXCLUDED.updated_by,
           updated_at = now(),
           last_test_ok = NULL,
           last_test_message = NULL,
           last_tested_at = NULL`,
    [client, kind, JSON.stringify(input.config), ciphertext, input.updatedBy],
  );
}

export async function recordIntegrationTest(
  client: string,
  kind: IntegrationKind,
  ok: boolean,
  message: string,
): Promise<void> {
  await getPool().query(
    `UPDATE client_integrations
     SET last_test_ok = $3, last_test_message = $4, last_tested_at = now()
     WHERE client = $1 AND kind = $2`,
    [client, kind, ok, message.slice(0, 500)],
  );
}

/**
 * "Desconectar": keeps the row but empties it, rather than deleting it —
 * a missing row makes lib/client-config.ts fall back to the old
 * `CLIENT_<SLUG>_*` env vars, which would silently reconnect a client that
 * still has them set.
 */
export async function clearIntegration(
  client: string,
  kind: IntegrationKind,
  updatedBy: string,
): Promise<void> {
  await getPool().query(
    `INSERT INTO client_integrations (client, kind, config, secret_ciphertext, updated_by, updated_at)
     VALUES ($1, $2, '{}'::jsonb, NULL, $3, now())
     ON CONFLICT (client, kind) DO UPDATE
       SET config = '{}'::jsonb, secret_ciphertext = NULL, updated_by = EXCLUDED.updated_by,
           updated_at = now(), last_test_ok = NULL, last_test_message = NULL, last_tested_at = NULL`,
    [client, kind, updatedBy],
  );
}

// --- Dashboards (the `clients` row itself) -------------------------------

/**
 * Top-level paths that already mean something in this app — a client slug
 * becomes `/{slug}`, so it can't shadow one of them.
 */
const RESERVED_SLUGS = new Set([
  "nuevo",
  "login",
  "invite",
  "forgot-password",
  "reset-password",
  "ingest",
  "api",
  "configuracion",
  "_next",
  "favicon.ico",
]);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Returns an error message in Spanish, or null when the slug is usable. */
export function validateSlug(slug: string): string | null {
  if (slug.length < 2 || slug.length > 40) return "Debe tener entre 2 y 40 caracteres.";
  if (!SLUG_PATTERN.test(slug)) {
    return "Solo minúsculas, números y guiones (sin espacios ni acentos), p. ej. acme-mexico.";
  }
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" es una ruta reservada de la app.`;
  return null;
}

/** "Lumiservicios Querétaro" → "lumiservicios-queretaro". */
export function suggestSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** "lumiservicios.com/contacto" → "https://lumiservicios.com"; null if it isn't a URL. */
export function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!url.hostname.includes(".")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function slugExists(slug: string): Promise<boolean> {
  const { rowCount } = await getPool().query(`SELECT 1 FROM clients WHERE slug = $1`, [slug]);
  return (rowCount ?? 0) > 0;
}

/** New dashboards always start as drafts — see 006_client_settings.sql. */
export async function createDraftClient(input: {
  slug: string;
  displayName: string;
  allowedOrigin: string | null;
  faviconPath: string | null;
  createdBy: string;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO clients (slug, display_name, allowed_origin, favicon_path, is_draft, created_by)
     VALUES ($1, $2, $3, $4, true, $5)`,
    [input.slug, input.displayName, input.allowedOrigin, input.faviconPath, input.createdBy],
  );
}

export async function updateClientGeneral(
  slug: string,
  input: { displayName: string; allowedOrigin: string | null; faviconPath?: string | null },
): Promise<void> {
  if (input.faviconPath === undefined) {
    await getPool().query(
      `UPDATE clients SET display_name = $2, allowed_origin = $3 WHERE slug = $1`,
      [slug, input.displayName, input.allowedOrigin],
    );
  } else {
    await getPool().query(
      `UPDATE clients SET display_name = $2, allowed_origin = $3, favicon_path = $4 WHERE slug = $1`,
      [slug, input.displayName, input.allowedOrigin, input.faviconPath],
    );
  }
}

export async function setClientDraft(slug: string, isDraft: boolean): Promise<void> {
  await getPool().query(`UPDATE clients SET is_draft = $2 WHERE slug = $1`, [slug, isDraft]);
}

// --- Conversions ---------------------------------------------------------

export type ConversionKind = "event" | "form";

export interface Conversion {
  id: string;
  kind: ConversionKind;
  /** OpenPanel event name (kind 'event') or `leads.source` value (kind 'form'). */
  key: string;
  label: string;
  /** Page the form lives on — only meaningful for kind 'form'. */
  pagePath: string | null;
}

interface ConversionTableRow {
  id: string;
  kind: ConversionKind;
  key: string;
  label: string;
  page_path: string | null;
}

export async function listConversions(client: string): Promise<Conversion[]> {
  const { rows } = await getPool().query<ConversionTableRow>(
    `SELECT id, kind, key, label, page_path
     FROM client_conversions WHERE client = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [client],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    key: r.key,
    label: r.label,
    pagePath: r.page_path,
  }));
}

/**
 * Replaces the whole list in one transaction — the Configuración editor
 * always submits the full list in its display order. Rows are matched by
 * `key`, so renaming a label or moving a row keeps the same id; removing a
 * form conversion does NOT delete its leads (they stay in `leads`, they're
 * just no longer counted until the key is added back).
 */
export async function replaceConversions(
  client: string,
  conversions: Omit<Conversion, "id">[],
): Promise<void> {
  const pool = getPool();
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`DELETE FROM client_conversions WHERE client = $1 AND NOT (key = ANY($2::text[]))`, [
      client,
      conversions.map((c) => c.key),
    ]);
    for (const [i, c] of conversions.entries()) {
      await db.query(
        `INSERT INTO client_conversions (client, kind, key, label, page_path, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (client, key) DO UPDATE
           SET kind = EXCLUDED.kind, label = EXCLUDED.label,
               page_path = EXCLUDED.page_path, sort_order = EXCLUDED.sort_order`,
        [client, c.kind, c.key, c.label, c.kind === "form" ? c.pagePath : null, i],
      );
    }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

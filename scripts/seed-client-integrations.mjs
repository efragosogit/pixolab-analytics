/**
 * One-off migration helper: copies a client's old `CLIENT_<SLUG>_*` env
 * vars (OpenPanel, Search Console, Google Ads) into the
 * `client_integrations` table from db/migrations/006_client_settings.sql,
 * encrypting the OpenPanel secret the same way lib/secrets.ts does. After
 * this, the dashboard reads that client's settings from the DB (editable
 * from Configuración) and the env vars are only a fallback nobody reads.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-client-integrations.mjs lumiservicios
 *
 * Needs DATABASE_URL (through `pnpm db:tunnel` from a dev machine),
 * CONFIG_ENCRYPTION_KEY — the SAME one production uses, or the app won't
 * be able to decrypt what this writes — and the client's env vars.
 *
 * Never overwrites: an integration that already has a row (saved from
 * Configuración, or by a previous run) is skipped and reported. Doesn't
 * print any secret. Doesn't touch the leads ingest secret — a client
 * without one keeps using the global LEADS_INGEST_SECRET, which is what
 * its live GTM tag already sends.
 *
 * Mirrors lib/secrets.ts's format by hand (`v1:iv:tag:ciphertext`, all
 * base64, AES-256-GCM over a JSON object) rather than importing the TS
 * module — these scripts run as plain Node ESM, no build step.
 */
import { createCipheriv, randomBytes } from "node:crypto";
import pg from "pg";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node --env-file=.env.local scripts/seed-client-integrations.mjs <slug>");
  process.exit(1);
}
for (const name of ["DATABASE_URL", "CONFIG_ENCRYPTION_KEY"]) {
  if (!process.env[name]) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
}
const key = Buffer.from(process.env.CONFIG_ENCRYPTION_KEY, "base64");
if (key.length !== 32) {
  console.error("CONFIG_ENCRYPTION_KEY must be 32 bytes, base64.");
  process.exit(1);
}

function encryptFields(fields) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(fields), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

const prefix = slug.toUpperCase().replace(/-/g, "_");
const env = (name) => process.env[`CLIENT_${prefix}_${name}`] || null;

const candidates = [
  {
    kind: "openpanel",
    ready: env("OPENPANEL_CLIENT_ID") && env("OPENPANEL_CLIENT_SECRET") && env("OPENPANEL_PROJECT_ID"),
    config: { clientId: env("OPENPANEL_CLIENT_ID"), projectId: env("OPENPANEL_PROJECT_ID") },
    secrets: { clientSecret: env("OPENPANEL_CLIENT_SECRET") },
  },
  {
    kind: "gsc",
    ready: env("GSC_SITE_URL"),
    config: { siteUrl: env("GSC_SITE_URL") },
    secrets: null,
  },
  {
    kind: "google_ads",
    ready: env("GOOGLE_ADS_CUSTOMER_ID"),
    config: { customerId: env("GOOGLE_ADS_CUSTOMER_ID") },
    secrets: null,
  },
];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rowCount } = await pool.query(`SELECT 1 FROM clients WHERE slug = $1`, [slug]);
  if (!rowCount) throw new Error(`No client "${slug}" in the clients table.`);

  for (const c of candidates) {
    if (!c.ready) {
      console.log(`${c.kind}: no env vars for CLIENT_${prefix}_*, skipped`);
      continue;
    }
    const result = await pool.query(
      `INSERT INTO client_integrations (client, kind, config, secret_ciphertext, updated_by)
       VALUES ($1, $2, $3, $4, 'seed-client-integrations.mjs')
       ON CONFLICT (client, kind) DO NOTHING`,
      [slug, c.kind, JSON.stringify(c.config), c.secrets ? encryptFields(c.secrets) : null],
    );
    console.log(`${c.kind}: ${result.rowCount ? "copied to the DB" : "already had a row, left untouched"}`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}

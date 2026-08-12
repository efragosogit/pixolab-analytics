/**
 * One-off backfill: import a CFDB7 CSV export into the real `leads` table
 * with each row's *original* submission timestamp — not "now". Bypasses
 * `lib/leads-db.ts`'s `insertLead` (which always stamps `now()`, correct
 * for live GTM traffic but wrong here) and writes directly via `pg`.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-historical-leads.mjs \
 *     <csv-path> <form_submitted|catalog_download>
 *
 * Expects CFDB7's default export columns: Id, Date, Status, Nombre,
 * "E Mail", and optionally Telefono / Mensaje / Asunto (the catalog-
 * download form only has Nombre/E Mail; the contact form also has these
 * three — columns are looked up by name, missing ones just come out
 * null, so the same script handles both exports). Id is kept in `raw`
 * for traceability back to the WordPress record; Asunto (subject) gets
 * prefixed onto the message rather than getting its own DB column, since
 * it's contact-form-only and not worth a schema column for one field.
 *
 * Assumes CSV timestamps are in America/Mexico_City (Lumiservicios is a
 * Puebla company, WordPress's default site timezone) — sets the Postgres
 * session timezone accordingly before inserting so naive "YYYY-MM-DD
 * HH:mm:ss" strings land on the right UTC instant instead of whatever the
 * DB server's default zone happens to be.
 *
 * Not idempotent — don't run the same file twice, there's no dedupe. This
 * is a run-once-by-hand tool, not something wired into the app.
 */
import fs from "node:fs";
import pg from "pg";

const [, , csvPath, source] = process.argv;

const PAGE_PATH = {
  form_submitted: "/contactanos",
  catalog_download: "/catalogo-lumi",
};

if (!csvPath || !source || !PAGE_PATH[source]) {
  console.error(
    "Usage: node --env-file=.env.local scripts/import-historical-leads.mjs <csv-path> <form_submitted|catalog_download>",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL — run with --env-file=.env.local");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const text = fs.readFileSync(csvPath, "utf8");
const rows = parseCsv(text);
const header = rows[0].map((h) => h.trim());
const dataRows = rows.slice(1).filter((r) => r.some((v) => v.trim() !== ""));

const idx = {
  id: header.indexOf("Id"),
  date: header.indexOf("Date"),
  nombre: header.indexOf("Nombre"),
  email: header.indexOf("E Mail"),
  telefono: header.indexOf("Telefono"),
  asunto: header.indexOf("Asunto"),
  mensaje: header.indexOf("Mensaje"),
};

if (idx.date === -1 || idx.nombre === -1 || idx.email === -1) {
  console.error("Expected columns Id, Date, Nombre, 'E Mail' — got:", header);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query("SET timezone = 'America/Mexico_City'");

let inserted = 0;
for (const r of dataRows) {
  const cf7dbId = idx.id !== -1 ? r[idx.id] : null;
  const date = r[idx.date];
  const name = r[idx.nombre]?.trim() || null;
  const email = r[idx.email]?.trim() || null;
  const phone = idx.telefono !== -1 ? r[idx.telefono]?.trim() || null : null;
  const asunto = idx.asunto !== -1 ? r[idx.asunto]?.trim() : "";
  const mensaje = idx.mensaje !== -1 ? r[idx.mensaje]?.trim() : "";
  const message = [asunto, mensaje].filter(Boolean).join(": ") || null;

  await pool.query(
    `INSERT INTO leads (client, source, name, email, phone, message, page_path, raw, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamp)`,
    [
      "lumiservicios",
      source,
      name,
      email,
      phone,
      message,
      PAGE_PATH[source],
      JSON.stringify({ imported_from: "cf7db_csv", cf7db_id: cf7dbId }),
      date,
    ],
  );
  inserted++;
}

console.log(`Imported ${inserted} historical leads (source=${source}) from ${csvPath}`);
await pool.end();

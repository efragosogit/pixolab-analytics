/**
 * Real leads storage — Postgres, shared across the Pixolab Dashboards
 * ecosystem (Railway project "Pixolab Dashboards", one shared multi-tenant
 * app now, not one deployment per client). See `lib/db.ts` for the
 * connection pool and `db/migrations/001_leads.sql` /
 * `002_lead_qualification.sql` for the schema. Verified live 2026-08-11
 * (insert + select round-trip).
 *
 * `client` is passed explicitly by every caller (the `leads.client`
 * column value, FK'd to `clients.slug` — see `004_multi_tenant.sql`), not
 * a hardcoded module constant — this file now serves every tenant.
 */
import { getPool } from "./db";
import type { DateRange } from "./openpanel";

/** 1-5, controlled scale — see 002_lead_qualification.sql's comment. */
export type QualityRating = 1 | 2 | 3 | 4 | 5;

export const QUALITY_RATING_LABELS: Record<QualityRating, string> = {
  1: "Descartado",
  2: "Frío",
  3: "Tibio",
  4: "Caliente",
  5: "Muy caliente",
};

export interface LeadRecord {
  id: string;
  source: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  pagePath: string | null;
  formId: string | null;
  createdAt: string;
  qualityRating: QualityRating | null;
  qualifierNotes: string | null;
  qualifiedBy: string | null;
  qualifiedAt: string | null;
}

export interface NewLeadInput {
  source: string;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  pagePath?: string;
  formId?: string;
  raw?: unknown;
}

export async function insertLead(client: string, input: NewLeadInput): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO leads (client, source, name, email, phone, message, page_path, form_id, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      client,
      input.source,
      input.name ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.message ?? null,
      input.pagePath ?? null,
      input.formId ?? null,
      JSON.stringify(input.raw ?? {}),
    ],
  );
}

interface LeadRow {
  id: string;
  source: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  page_path: string | null;
  form_id: string | null;
  created_at: Date;
  quality_rating: number | null;
  qualifier_notes: string | null;
  qualified_by: string | null;
  qualified_at: Date | null;
}

function toRecord(r: LeadRow): LeadRecord {
  return {
    id: r.id,
    source: r.source,
    name: r.name,
    email: r.email,
    phone: r.phone,
    message: r.message,
    pagePath: r.page_path,
    formId: r.form_id,
    createdAt: r.created_at.toISOString(),
    qualityRating: (r.quality_rating as QualityRating | null) ?? null,
    qualifierNotes: r.qualifier_notes,
    qualifiedBy: r.qualified_by,
    qualifiedAt: r.qualified_at ? r.qualified_at.toISOString() : null,
  };
}

const SELECT_FIELDS = `id, source, name, email, phone, message, page_path, form_id, created_at,
       quality_rating, qualifier_notes, qualified_by, qualified_at`;

export async function getLeadsFromDb(client: string, range: DateRange): Promise<LeadRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query<LeadRow>(
    `SELECT ${SELECT_FIELDS}
     FROM leads
     WHERE client = $1
       AND created_at >= $2::date
       AND created_at < ($3::date + interval '1 day')
     ORDER BY created_at DESC`,
    [client, range.startDate, range.endDate],
  );
  return rows.map(toRecord);
}

export interface QualificationInput {
  leadId: string;
  rating: QualityRating | null;
  notes: string | null;
  qualifiedBy: string | null;
}

/**
 * Human qualification, applied after the fact by whoever contacted the
 * lead. `rating: null` clears a previous rating (e.g. someone re-opens the
 * modal and picks the blank option again) — `qualified_at` follows suit,
 * set only when a real rating is saved.
 */
export async function updateLeadQualification(
  client: string,
  input: QualificationInput,
): Promise<LeadRecord> {
  const pool = getPool();
  const { rows } = await pool.query<LeadRow>(
    `UPDATE leads
     SET quality_rating = $2,
         qualifier_notes = $3,
         qualified_by = $4,
         qualified_at = CASE WHEN $2::smallint IS NULL THEN NULL ELSE now() END
     WHERE id = $1 AND client = $5
     RETURNING ${SELECT_FIELDS}`,
    [input.leadId, input.rating, input.notes, input.qualifiedBy, client],
  );
  if (rows.length === 0) {
    throw new Error(`Lead ${input.leadId} not found for client ${client}`);
  }
  return toRecord(rows[0]);
}

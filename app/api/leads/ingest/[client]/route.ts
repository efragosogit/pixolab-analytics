/**
 * Per-client version of the leads webhook — receives lead data from a
 * client site's GTM Custom HTML tag (the same one already firing
 * `window.op('track', ...)` to OpenPanel), namespaced by `client` so one
 * shared dashboard deployment can ingest leads for every client site
 * instead of assuming Lumiservicios.
 *
 * The flat `app/api/leads/ingest/route.ts` (no `[client]` segment) is kept
 * working during the transition — it hardcodes `client = "lumiservicios"`
 * for Lumiservicios' existing live GTM tag, which doesn't need to change
 * until someone deliberately repoints it at this per-client path. New
 * clients should use this route from day one.
 *
 * Auth: a shared secret in the `x-ingest-secret` header — NOT a real
 * secret in the security sense (ships inside client-side JS on a public
 * website, readable via devtools). Its job is cutting drive-by noise, not
 * gating a motivated attacker. One secret shared across every client
 * (`LEADS_INGEST_SECRET`) — see CLAUDE.md for why that's an acceptable
 * simplification here.
 *
 * `Access-Control-Allow-Origin` is looked up per-client from
 * `clients.allowed_origin` (see db/migrations/005_client_allowed_origin.sql)
 * instead of a hardcoded domain.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { insertLead } from "@/lib/leads-db";
import { getClientRow } from "@/lib/client-config";

function corsHeaders(allowedOrigin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-ingest-secret",
  };
}

const payloadSchema = z.object({
  source: z.enum(["form_submitted", "catalog_download"]),
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  message: z.string().trim().max(2000).optional(),
  page_path: z.string().trim().max(500).optional(),
  form_id: z.union([z.string(), z.number()]).optional(),
});

export async function OPTIONS(
  _req: Request,
  { params }: { params: Promise<{ client: string }> },
) {
  const { client } = await params;
  const row = await getClientRow(client);
  return new NextResponse(null, { status: 204, headers: corsHeaders(row?.allowedOrigin ?? "") });
}

export async function POST(req: Request, { params }: { params: Promise<{ client: string }> }) {
  const { client } = await params;
  const row = await getClientRow(client);
  if (!row || !row.active || !row.allowedOrigin) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }
  const headers = corsHeaders(row.allowedOrigin);

  const secret = process.env.LEADS_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Ingest not configured" }, { status: 503, headers });
  }
  if (req.headers.get("x-ingest-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400, headers },
    );
  }

  try {
    await insertLead(client, {
      source: parsed.data.source,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      message: parsed.data.message,
      pagePath: parsed.data.page_path,
      formId: parsed.data.form_id !== undefined ? String(parsed.data.form_id) : undefined,
      raw: body,
    });
  } catch (e) {
    console.error(`leads/ingest/${client}: insert failed`, e);
    return NextResponse.json({ error: "Storage failed" }, { status: 500, headers });
  }

  return NextResponse.json({ ok: true }, { headers });
}

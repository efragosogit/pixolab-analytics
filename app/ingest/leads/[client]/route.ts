/**
 * Per-client leads webhook — receives lead data from a client site's GTM
 * Custom HTML tag (the same one already firing `window.op('track', ...)`
 * to OpenPanel), namespaced by `client` so one shared dashboard deployment
 * can ingest leads for every client site instead of assuming Lumiservicios.
 *
 * Lives at `/ingest/leads/[client]`, deliberately NOT under `/api` —
 * `analytics.pixolab.com.mx/api/*` is reserved for OpenPanel's own API
 * (Traefik routes that whole prefix to the OpenPanel service on this
 * domain, see CLAUDE.md's "Deployed 2026-08-13" section), so any route
 * this app defines under `app/api/*` is unreachable on this domain,
 * silently swallowed by that rule and 404'd by OpenPanel itself instead.
 * Confirmed live 2026-08-13: this route used to live at
 * `app/api/leads/ingest/[client]/route.ts` and a request to it returned
 * OpenPanel's own `{"message":"Route POST:/leads/ingest/... not found"}`
 * — never reached this app at all. This was also the reason no lead
 * traffic showed up after the Phase 5 domain cutover: turned out moot
 * this time because the GTM tag update was never actually pasted in
 * either (verified against the live GTM container), but it would have
 * 404'd even if it had been. Don't add any future route under `app/api/*`
 * in this app while OpenPanel's API keeps that reservation on this domain.
 *
 * Only one ingest path now (this one) — the earlier flat
 * `app/api/leads/ingest/route.ts` hardcoded to `client = "lumiservicios"`
 * for "the existing live GTM tag" was removed at the same time as this
 * move: that tag turned out to never have been updated to call either
 * path, so there was nothing live left to preserve compatibility with.
 * Every client, including Lumiservicios, uses this per-client route.
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

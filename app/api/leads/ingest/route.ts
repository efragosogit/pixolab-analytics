/**
 * Legacy flat route — receives lead data from the GTM Custom HTML tag on
 * lumiservicios.com specifically (the same one already firing
 * `window.op('track', 'form_submitted'/'catalog_download', ...)` to
 * OpenPanel on `wpcf7mailsent` — this is an addition to that listener,
 * not a replacement). Hardcodes `client = "lumiservicios"` since that's
 * the one live GTM tag still pointed at this exact path.
 *
 * New clients (and Lumiservicios too, whenever its GTM tag gets updated)
 * should use `app/api/leads/ingest/[client]/route.ts` instead — this file
 * stays only so the existing live tag keeps working without a
 * synchronized cutover. See that file's doc comment for the full
 * reasoning; retire this one once Lumiservicios' GTM container is
 * confirmed migrated.
 *
 * Auth: a shared secret in the `x-ingest-secret` header. This is NOT a
 * real secret in the security sense — it ships inside client-side JS on a
 * public website, so anyone who opens devtools can read it. Its job is to
 * cut down accidental/drive-by noise (randomly hitting the endpoint),
 * not to gate access from a motivated attacker. Don't rely on it for
 * anything sensitive.
 *
 * Only reachable once this dashboard is deployed publicly — GTM runs in
 * visitors' browsers on the live site, it can't reach `localhost`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { insertLead } from "@/lib/leads-db";

const CLIENT = "lumiservicios";
const ALLOWED_ORIGIN = "https://lumiservicios.com";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  const secret = process.env.LEADS_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Ingest not configured" },
      { status: 503, headers: corsHeaders() },
    );
  }
  if (req.headers.get("x-ingest-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders() });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() },
    );
  }

  try {
    await insertLead(CLIENT, {
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
    console.error("leads/ingest: insert failed", e);
    return NextResponse.json({ error: "Storage failed" }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json({ ok: true }, { headers: corsHeaders() });
}

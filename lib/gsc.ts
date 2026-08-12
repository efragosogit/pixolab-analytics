/**
 * Server-only client for the Google Search Console API, connected directly
 * to this dashboard — deliberately NOT going through OpenPanel's own GSC
 * integration (that needs GOOGLE_CLIENT_ID/SECRET + a redirect URI wired up
 * in Coolify, infra this dashboard doesn't have access to; connecting GSC
 * straight to the dashboard is also just what the project's own plan
 * already called for — see pixolab-analytics/CLAUDE.md's "bigger plan").
 *
 * Auth: a Google service account (not OAuth) — added as a Restricted user
 * directly on the Search Console property, so there's no consent screen or
 * callback route to host. Credentials in `.env.local`
 * (`GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`),
 * never committed — see README for setup.
 *
 * The service account (email + private key) is global — one Google Cloud
 * project shared across every client. `siteUrl` is per-client (a domain
 * property like `sc-domain:lumiservicios.com`, not necessarily a
 * URL-prefix property — confirmed per-client, never assume
 * `https://example.com` works interchangeably, GSC treats those as
 * different properties entirely), resolved per-request by
 * `lib/client-config.ts` from the `client` URL segment and passed as the
 * first argument to every exported function below.
 *
 * This file is never imported from a Client Component — the private key
 * must stay server-side.
 */
import { google } from "googleapis";
import type { DateRange } from "./openpanel";

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

function assertConfigured() {
  if (!SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error(
      "Missing GSC env vars — copy .env.local.example to .env.local and fill in GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
    );
  }
}

let authClient: InstanceType<typeof google.auth.JWT> | null = null;

function getAuthClient() {
  assertConfigured();
  authClient ??= new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    // .env files don't interpret \n — the key is stored with literal
    // two-char "\n" sequences and needs converting back to real newlines.
    key: SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  return authClient;
}

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number; // 0-1
  position: number;
}

async function searchAnalyticsQuery(
  siteUrl: string,
  params: {
    startDate: string;
    endDate: string;
    dimensions?: string[];
    rowLimit?: number;
  },
): Promise<GscRow[]> {
  assertConfigured();
  const searchconsole = google.searchconsole({ version: "v1", auth: getAuthClient() });
  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: params.startDate,
      endDate: params.endDate,
      dimensions: params.dimensions,
      rowLimit: params.rowLimit ?? 25,
    },
  });
  return (res.data.rows ?? []).map((r) => ({
    keys: r.keys ?? [],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

// --- Overview: totals for the range + a daily series ---

export interface SeoOverview {
  clicks: number;
  impressions: number;
  ctr: number; // 0-100
  avgPosition: number;
  series: { date: string; clicks: number; impressions: number }[];
}

export async function getSeoOverview(siteUrl: string, range: DateRange): Promise<SeoOverview> {
  const [totalRows, dailyRows] = await Promise.all([
    // No dimensions = one aggregate row for the whole range — lets Google
    // compute the correct weighted CTR/position instead of us re-deriving
    // it from the daily rows.
    searchAnalyticsQuery(siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: [],
    }),
    searchAnalyticsQuery(siteUrl, {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ["date"],
      rowLimit: 1000,
    }),
  ]);

  const totals = totalRows[0];
  const series = dailyRows
    .map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    clicks: totals?.clicks ?? 0,
    impressions: totals?.impressions ?? 0,
    ctr: (totals?.ctr ?? 0) * 100,
    avgPosition: totals?.position ?? 0,
    series,
  };
}

// --- Top queries ---

export interface SeoQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0-100
  position: number;
}

export async function getSeoQueries(
  siteUrl: string,
  range: DateRange,
  limit = 25,
): Promise<SeoQuery[]> {
  const rows = await searchAnalyticsQuery(siteUrl, {
    startDate: range.startDate,
    endDate: range.endDate,
    dimensions: ["query"],
    rowLimit: limit,
  });
  return rows
    .map((r) => ({
      query: r.keys[0] ?? "(sin datos)",
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr * 100,
      position: r.position,
    }))
    .sort((a, b) => b.clicks - a.clicks);
}

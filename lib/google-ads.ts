/**
 * Server-only client for the Google Ads API, connected directly to this
 * dashboard (same reasoning as `lib/gsc.ts` — a source OpenPanel can't
 * hold, so it plugs straight into the dashboard instead of going through
 * any other system).
 *
 * Auth: OAuth refresh token (Google Ads API doesn't support service
 * accounts for a regular advertiser account) — see
 * `scripts/get-google-ads-refresh-token.mjs` for how it was generated.
 * Credentials in `.env.local`, never committed.
 *
 * The developer token is at "Test account access" — per Google's docs that
 * should restrict queries to test accounts only, but read queries against
 * the real Lumiservicios account were verified live and work fine. If that
 * ever changes (Google tightening enforcement), the fix is applying for
 * Basic access in the MCC's API Center, not a code change here.
 *
 * The OAuth app (client id/secret/refresh token) and developer token are
 * global — one Pixolab-owned MCC/OAuth app shared across every client.
 * The target `customerId` is per-client, resolved per-request by
 * `lib/client-config.ts` and passed as the first argument to every
 * exported function below. Each client account is assumed direct (not
 * nested under an MCC for API purposes) — `login_customer_id` is set to
 * the same id as `customerId`. If a client's account ever moves under a
 * manager account and this starts failing with a permissions error,
 * `login_customer_id` needs to become the MCC's id instead, per-client.
 *
 * This file is never imported from a Client Component — the refresh token
 * must stay server-side.
 */
import { GoogleAdsApi } from "google-ads-api";
import type { DateRange } from "./openpanel";

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN;

const MICROS_PER_UNIT = 1_000_000;

/** All calendar days in `range`, inclusive, as YYYY-MM-DD strings. */
function enumerateDays(range: DateRange): string[] {
  const days: string[] = [];
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days.length > 0 ? days : [range.startDate];
}

function assertConfigured() {
  if (!CLIENT_ID || !CLIENT_SECRET || !DEVELOPER_TOKEN || !REFRESH_TOKEN) {
    throw new Error(
      "Missing Google Ads env vars — copy .env.local.example to .env.local and fill in GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_REFRESH_TOKEN.",
    );
  }
}

let api: GoogleAdsApi | null = null;

function getCustomer(customerId: string) {
  assertConfigured();
  api ??= new GoogleAdsApi({
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    developer_token: DEVELOPER_TOKEN!,
  });
  return api.Customer({
    customer_id: customerId,
    refresh_token: REFRESH_TOKEN!,
    login_customer_id: customerId,
  });
}

interface CampaignMetricsRow {
  campaign?: { name?: string | null };
  segments?: { date?: string | null };
  metrics?: {
    cost_micros?: number | null;
    clicks?: number | null;
    conversions?: number | null;
    conversions_value?: number | null;
    impressions?: number | null;
  };
}

// --- Overview: totals for the range + a daily series ---

export interface AdsOverview {
  spend: number;
  conversions: number;
  cpa: number;
  roas: number;
  impressions: number;
  series: { date: string; spend: number; conversions: number; impressions: number }[];
}

export async function getAdsOverview(customerId: string, range: DateRange): Promise<AdsOverview> {
  const customer = getCustomer(customerId);
  // `FROM campaign` still returns one row per (campaign, date) even when
  // campaign fields aren't in SELECT — it does NOT collapse to one row per
  // date on its own. Aggregate by date client-side below; don't assume the
  // API grouped it for you (verified live: a 3-campaign account came back
  // as 3 rows per day, not 1).
  const rows = (await customer.query(`
    SELECT
      segments.date,
      metrics.cost_micros,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.impressions
    FROM campaign
    WHERE segments.date BETWEEN '${range.startDate}' AND '${range.endDate}'
    ORDER BY segments.date ASC
  `)) as CampaignMetricsRow[];

  // Zero-filled across every day in `range`, not just days with activity —
  // otherwise a real drop to zero spend (which is exactly what this
  // account's data shows past a point) looks like the chart's data just
  // stops, instead of honestly showing a flat zero.
  const byDate = new Map<string, { spend: number; conversions: number; impressions: number }>();
  for (const date of enumerateDays(range)) {
    byDate.set(date, { spend: 0, conversions: 0, impressions: 0 });
  }
  let conversionsValue = 0;

  for (const r of rows) {
    const date = r.segments?.date ?? range.startDate;
    const bucket = byDate.get(date) ?? { spend: 0, conversions: 0, impressions: 0 };
    bucket.spend += (r.metrics?.cost_micros ?? 0) / MICROS_PER_UNIT;
    bucket.conversions += r.metrics?.conversions ?? 0;
    bucket.impressions += r.metrics?.impressions ?? 0;
    byDate.set(date, bucket);
    conversionsValue += r.metrics?.conversions_value ?? 0;
  }

  const series = Array.from(byDate.entries())
    .map(([date, b]) => ({
      date,
      spend: Math.round(b.spend),
      conversions: Math.round(b.conversions),
      impressions: b.impressions,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const spend = series.reduce((sum, d) => sum + d.spend, 0);
  const conversions = series.reduce((sum, d) => sum + d.conversions, 0);
  const impressions = series.reduce((sum, d) => sum + d.impressions, 0);

  return {
    spend,
    conversions,
    cpa: conversions > 0 ? spend / conversions : 0,
    roas: spend > 0 ? conversionsValue / spend : 0,
    impressions,
    series,
  };
}

// --- Per-campaign breakdown ---

export interface AdsCampaign {
  name: string;
  platform: "Google Ads";
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number;
  roas: number;
}

export async function getAdsCampaigns(
  customerId: string,
  range: DateRange,
): Promise<AdsCampaign[]> {
  const customer = getCustomer(customerId);
  const rows = (await customer.query(`
    SELECT
      campaign.name,
      metrics.cost_micros,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${range.startDate}' AND '${range.endDate}'
    ORDER BY metrics.cost_micros DESC
  `)) as CampaignMetricsRow[];

  return rows.map((r) => {
    const spend = (r.metrics?.cost_micros ?? 0) / MICROS_PER_UNIT;
    const conversions = r.metrics?.conversions ?? 0;
    const conversionsValue = r.metrics?.conversions_value ?? 0;
    return {
      name: r.campaign?.name ?? "(sin nombre)",
      platform: "Google Ads" as const,
      spend,
      clicks: r.metrics?.clicks ?? 0,
      conversions: Math.round(conversions),
      cpa: conversions > 0 ? spend / conversions : 0,
      roas: spend > 0 ? conversionsValue / spend : 0,
    };
  });
}

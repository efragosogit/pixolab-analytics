/**
 * Server-only client for OpenPanel's Insights REST API.
 *
 * Auth: `openpanel-client-id` / `openpanel-client-secret` headers, using a
 * `read`-type client (create one in the OpenPanel dashboard under
 * Settings → Clients — the default `write` client used for GTM tracking
 * cannot access this API). See ../README.md for setup.
 *
 * Multi-tenant: `OPENPANEL_API_URL` is global (one self-hosted instance
 * serves every client), but the client id/secret/project id are per-client
 * — every exported function below takes an `OpenPanelCreds` as its first
 * argument, resolved per-request by `lib/client-config.ts` from the
 * `client` URL segment. Nothing in this file reads a per-client env var
 * directly anymore.
 *
 * This instance runs a custom-built API image (see pixolab-server's
 * inventory.md, "Custom image upgrade") specifically so these endpoints
 * exist — the officially published image (March 2026) didn't have
 * /overview, /funnel, /pages/top, /pages/performance, /traffic/*, MCP.
 * All shapes below were verified against real responses on 2026-08-04.
 *
 * This file is never imported from a Client Component — secrets must
 * stay server-side.
 */

const API_URL = process.env.OPENPANEL_API_URL;

export interface OpenPanelCreds {
  clientId: string;
  clientSecret: string;
  projectId: string;
}

function assertApiUrlConfigured() {
  if (!API_URL) {
    throw new Error(
      'Missing OPENPANEL_API_URL — copy .env.local.example to .env.local and fill it in.',
    );
  }
}

/**
 * This instance's Insights API treats `[startDate, endDate)` as a
 * **half-open** range — `endDate` is excluded, not the last included day.
 * Verified live 2026-08-11: `/overview?startDate=2026-08-10&endDate=2026-08-10`
 * returns all-zero, while `endDate=2026-08-11` returns the real Aug 10
 * numbers. Every `DateRange` this dashboard builds (see `lib/date-range.ts`)
 * is *inclusive* on both ends — "Ayer"/"Hoy" set `startDate === endDate`
 * meaning "this one day" — so passed through unmodified, any single-day
 * range (today, yesterday, or a one-day custom pick) silently comes back
 * empty everywhere: Overview, funnels, event counts. Bump `endDate` by one
 * calendar day here, at the query boundary only, so callers/display code
 * keep using the inclusive range as-is (labels, headers, PDF titles all
 * read `range.endDate` directly and must keep showing the real last day).
 */
function toApiParams(
  params: Record<string, string | number | undefined>,
): Record<string, string | number | undefined> {
  if (typeof params.endDate !== 'string') return params;
  const exclusiveEnd = new Date(`${params.endDate}T00:00:00Z`);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  return { ...params, endDate: exclusiveEnd.toISOString().slice(0, 10) };
}

async function opFetch<T>(
  creds: OpenPanelCreds,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  assertApiUrlConfigured();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(toApiParams(params))) {
    if (value !== undefined) query.set(key, String(value));
  }

  const url = `${API_URL}/insights/${creds.projectId}${path}${query.size ? `?${query}` : ''}`;

  const res = await fetch(url, {
    headers: {
      'openpanel-client-id': creds.clientId,
      'openpanel-client-secret': creds.clientSecret,
    },
    // Dashboard data doesn't need to be instant-fresh; revalidate periodically.
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenPanel API ${path} failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<T>;
}

/** Same helper, but supports repeated query params (needed for /funnel's `steps`). */
async function opFetchMulti<T>(
  creds: OpenPanelCreds,
  path: string,
  params: Record<string, string | number | undefined>,
  multiParams: Record<string, string[]>,
): Promise<T> {
  assertApiUrlConfigured();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(toApiParams(params))) {
    if (value !== undefined) query.set(key, String(value));
  }
  for (const [key, values] of Object.entries(multiParams)) {
    for (const value of values) query.append(key, value);
  }

  const url = `${API_URL}/insights/${creds.projectId}${path}?${query}`;

  const res = await fetch(url, {
    headers: {
      'openpanel-client-id': creds.clientId,
      'openpanel-client-secret': creds.clientSecret,
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`OpenPanel API ${path} failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

export type DateRange = { startDate: string; endDate: string };

/** Last N full days, as YYYY-MM-DD strings (UTC). */
export function lastNDays(n: number): DateRange {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - n);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

// --- /overview ---

export interface OverviewMetrics {
  bounce_rate: number; // 0-100
  unique_visitors: number;
  total_sessions: number;
  avg_session_duration: number; // seconds
  total_screen_views: number;
  views_per_session: number;
  total_revenue: number;
}

export interface OverviewResponse {
  summary: OverviewMetrics;
  series: Array<OverviewMetrics & { date: string }>;
  interval: string;
  startDate: string;
  endDate: string;
}

export function getOverview(creds: OpenPanelCreds, range: DateRange) {
  return opFetch<OverviewResponse>(creds, '/overview', range);
}

// --- /pages/top ---

export interface TopPage {
  origin: string;
  path: string;
  sessions: number;
  pageviews: number;
  revenue: number;
}

export function getTopPages(creds: OpenPanelCreds, range: DateRange) {
  return opFetch<TopPage[]>(creds, '/pages/top', range);
}

// --- /pages/performance — richer than the legacy /pages, includes SEO signals ---

export interface PagePerformance {
  origin: string;
  path: string;
  title: string;
  sessions: number;
  pageviews: number;
  avg_duration: number; // seconds
  bounce_rate: number; // 0-100
  seo_signals: {
    high_bounce: boolean;
    low_engagement: boolean;
    good_landing_page: boolean;
  };
}

export interface PagePerformanceResponse {
  total_pages: number;
  shown: number;
  pages: PagePerformance[];
}

export function getPagePerformance(creds: OpenPanelCreds, range: DateRange, limit = 20) {
  return opFetch<PagePerformanceResponse>(creds, '/pages/performance', { ...range, limit });
}

// --- /traffic/referrers, /traffic/devices ---

export interface TrafficBreakdownItem {
  name: string | null;
  sessions: number;
  pageviews: number;
  revenue: number;
}

export function getTrafficReferrers(creds: OpenPanelCreds, range: DateRange) {
  return opFetch<TrafficBreakdownItem[]>(creds, '/traffic/referrers', range);
}

export function getTrafficDevices(creds: OpenPanelCreds, range: DateRange) {
  return opFetch<TrafficBreakdownItem[]>(creds, '/traffic/devices', range);
}

// --- /funnel ---

export interface FunnelStep {
  step: number;
  eventName: string;
  users: number;
  conversionRateFromStart: number; // 0-100
  dropoffPercent: number | null;
  isHighestDropoff: boolean;
}

export interface FunnelResult {
  steps: FunnelStep[];
  totalUsers: number;
  completedUsers: number;
  overallConversionRate: number; // 0-100
}

/** `steps` must be 2-10 event names, in order. */
export function getFunnel(
  creds: OpenPanelCreds,
  range: DateRange,
  steps: string[],
  windowHours = 24,
) {
  return opFetchMulti<FunnelResult>(
    creds,
    '/funnel',
    { startDate: range.startDate, endDate: range.endDate, windowHours },
    { steps },
  );
}

// --- /live ---

export function getLiveVisitors(creds: OpenPanelCreds) {
  return opFetch<{ visitors: number }>(creds, '/live');
}

// --- /events ---

/**
 * Raw ClickHouse event row (verified against packages/db's
 * `IClickhouseEvent` / `queryEventsCore` in the OpenPanel source, not just
 * inferred — see pixolab-analytics/apps/api/src/agents/tools/events.ts and
 * packages/db/src/services/event.service.ts). Only the fields this
 * dashboard actually reads are declared here.
 */
export interface ClickhouseEventRow {
  name: string;
  created_at: string; // ClickHouse DateTime, "YYYY-MM-DD HH:mm:ss" (UTC)
}

/**
 * `limit` is capped at 100 server-side (zEventsQuery) and the query has no
 * explicit ORDER BY, so this returns *up to* 100 matching rows for the
 * whole range, not guaranteed newest-first. Fine while lead volume is low
 * (tens/month); if it ever grows past ~100 events in a selected range,
 * counts will silently undercount — swap to a proper daily-aggregate
 * endpoint (or paginate) at that point instead of raising the limit
 * further (100 is the API's hard cap).
 */
export function getEvents(
  creds: OpenPanelCreds,
  range: DateRange,
  eventNames: string[],
  limit = 100,
) {
  return opFetchMulti<ClickhouseEventRow[]>(
    creds,
    '/events',
    { startDate: range.startDate, endDate: range.endDate, limit },
    { eventNames },
  );
}

export interface DailyEventCounts {
  date: string;
  total: number;
  byEvent: Record<string, number>;
}

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

/**
 * Daily counts for one or more events, zero-filled across every day in
 * `range` (not just days with activity) so charts render a continuous
 * series. Used for the leads journey chart — combines `whatsapp_click`
 * today, and will pick up `form_submitted` automatically the moment that
 * event starts flowing, no code change needed.
 */
export async function getDailyEventCounts(
  creds: OpenPanelCreds,
  range: DateRange,
  eventNames: string[],
): Promise<DailyEventCounts[]> {
  const events = await getEvents(creds, range, eventNames);
  const byDay = new Map<string, DailyEventCounts>();
  for (const day of enumerateDays(range)) {
    byDay.set(day, { date: day, total: 0, byEvent: Object.fromEntries(eventNames.map((n) => [n, 0])) });
  }
  for (const event of events) {
    const day = event.created_at.slice(0, 10);
    const bucket = byDay.get(day);
    if (!bucket) continue; // event just outside the day boundary in local vs UTC edge cases
    bucket.total += 1;
    bucket.byEvent[event.name] = (bucket.byEvent[event.name] ?? 0) + 1;
  }
  return Array.from(byDay.values());
}

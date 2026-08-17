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
  profile_id: string; // stable per-visitor id — used to dedupe actions into "leads" (people, not clicks)
  path: string; // page the event fired on
  region: string; // GeoIP-derived, English-ish names for MX states (e.g. "Mexico City", "Michoacán") — shown as-is, not translated
  device: string; // "desktop" | "mobile" | "tablet" (whatever the SDK detected)
  referrer_type: string; // "search" | "paid" | "social" | "direct" | "" (empty = no referrer)
}

/**
 * `limit` is capped at 100 server-side (zEventsQuery) and the query has no
 * explicit ORDER BY, so this returns *up to* 100 matching rows for the
 * whole range, not guaranteed newest-first, and does NOT tell you whether
 * there were actually more than 100 matches (a full 100-row response is
 * indistinguishable from "exactly 100 total"). Don't call this directly
 * for anything that needs an accurate count over a date range — use
 * `getAllEvents` below, which detects and works around the cap. This raw
 * function still exists because `getAllEvents` is built on top of it.
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

function addDaysToDateString(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * All events for one event name in `range`, working around `getEvents`'s
 * 100-row-per-call cap by bisecting the date range whenever a call comes
 * back at exactly the cap (the only observable sign of truncation, since
 * the API gives no total count).
 *
 * Added 2026-08-17 after a real miss: the previous version of this file
 * queried `whatsapp_click` and `form_submitted` together in one
 * `getEvents` call, sharing one 100-row budget — WhatsApp's higher volume
 * crowded out nearly all the form_submitted rows (3 of ~7 came back),
 * silently deflating the "Leads" journey stage and the "Leads por día"
 * chart. Splitting into one call per event name was a first fix, but
 * turned out insufficient on its own: verified live that `whatsapp_click`
 * ALONE already exceeds 100 raw events in a 30-day range (120, confirmed
 * by manually querying two 15-day halves — the single-call version had
 * been silently capped at 100 and nobody could tell from that response
 * alone). Bisecting per event name, recursively, is what actually fixes
 * this regardless of which single event type grows past the cap.
 *
 * Bottoms out at single-day ranges — a single calendar day with ≥100
 * occurrences of one event is not handled (would need a real
 * daily-aggregate endpoint instead of raw row fetches at that point) and
 * logs a warning instead of recursing forever.
 */
async function getAllEvents(
  creds: OpenPanelCreds,
  range: DateRange,
  eventName: string,
): Promise<ClickhouseEventRow[]> {
  const events = await getEvents(creds, range, [eventName]);
  if (events.length < 100) return events;

  if (range.startDate === range.endDate) {
    console.warn(
      `getAllEvents: "${eventName}" hit the 100-row cap on a single day (${range.startDate}) — can't bisect further, this count is an undercount`,
    );
    return events;
  }

  // Bisect on calendar days, inclusive on both halves.
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  const midOffset = Math.floor((end.getTime() - start.getTime()) / (2 * 86400000));
  const mid = addDaysToDateString(range.startDate, midOffset);
  const nextAfterMid = addDaysToDateString(mid, 1);

  const [left, right] = await Promise.all([
    getAllEvents(creds, { startDate: range.startDate, endDate: mid }, eventName),
    getAllEvents(creds, { startDate: nextAfterMid, endDate: range.endDate }, eventName),
  ]);
  return [...left, ...right];
}

export interface DailyEventCounts {
  date: string;
  total: number;
  byEvent: Record<string, number>;
}

/**
 * Daily counts for one or more events, zero-filled across every day in
 * `range` (not just days with activity) so charts render a continuous
 * series. Used for the leads journey chart (`whatsapp_click` +
 * `form_submitted` combined) and the per-source funnels. Built on
 * `getAllEvents` (see its doc comment) so it stays accurate as event
 * volume grows past the underlying API's 100-row-per-call cap, not just
 * at today's traffic level.
 *
 * Counts **unique people** (`profile_id`), not raw actions — a visitor
 * who clicks WhatsApp 3 times on the same day counts once that day, same
 * definition `/funnel` uses for its own conversion counts (a "lead" is a
 * person, not a count of their clicks). Dedup is scoped per (day, event
 * name): the same person converting on two different days counts once on
 * each — for a range-wide unique-person total (e.g. a single "Leads" KPI
 * for the whole period, not a daily breakdown), use `getUniqueLeadCount`
 * instead; summing this function's daily numbers will not generally equal
 * that total, same way daily-active-users don't sum to monthly-active-users.
 */
export async function getDailyEventCounts(
  creds: OpenPanelCreds,
  range: DateRange,
  eventNames: string[],
): Promise<DailyEventCounts[]> {
  const perEvent = await Promise.all(eventNames.map((name) => getAllEvents(creds, range, name)));
  const byDay = new Map<string, DailyEventCounts>();
  for (const day of enumerateDays(range)) {
    byDay.set(day, { date: day, total: 0, byEvent: Object.fromEntries(eventNames.map((n) => [n, 0])) });
  }
  const seenPerDayEvent = new Set<string>(); // `${day}|${eventName}|${profileId}`
  for (const events of perEvent) {
    for (const event of events) {
      const day = event.created_at.slice(0, 10);
      const bucket = byDay.get(day);
      if (!bucket) continue; // event just outside the day boundary in local vs UTC edge cases
      const dedupeKey = `${day}|${event.name}|${event.profile_id}`;
      if (seenPerDayEvent.has(dedupeKey)) continue;
      seenPerDayEvent.add(dedupeKey);
      bucket.total += 1;
      bucket.byEvent[event.name] = (bucket.byEvent[event.name] ?? 0) + 1;
    }
  }
  return Array.from(byDay.values());
}

/**
 * Total unique people (`profile_id`) who did any of `eventNames` at least
 * once across the whole `range` — the range-wide counterpart to
 * `getDailyEventCounts`'s per-day dedup (see its doc comment for why the
 * two don't sum to the same number). This is the number to show for a
 * single "leads generated this period" headline: matches `/funnel`'s own
 * definition of a conversion (one converting person), and is what a
 * "lead" means everywhere else in this app (a prospect, not an action
 * count) — used for the journey indicator's "Leads" stage and each
 * per-source funnel's final stage.
 */
export async function getUniqueLeadCount(
  creds: OpenPanelCreds,
  range: DateRange,
  eventNames: string[],
): Promise<number> {
  const perEvent = await Promise.all(eventNames.map((name) => getAllEvents(creds, range, name)));
  const profiles = new Set<string>();
  for (const events of perEvent) {
    for (const event of events) profiles.add(event.profile_id);
  }
  return profiles.size;
}

export interface RankedCount {
  label: string;
  count: number;
}

export interface EventDetail {
  totalEvents: number;
  topPaths: RankedCount[]; // top 10 pages, by raw click count (a page a person clicks from twice counts twice — this is "where clicks happen", not "unique people per page")
  topRegions: RankedCount[]; // top 10 MX states, same raw-count basis
  hourly: { hour: number; count: number }[]; // 24 entries (0-23), America/Mexico_City local hour, zero-filled
  peakHour: number; // 0-23, the single busiest local hour
  byDevice: RankedCount[];
  byReferrerType: RankedCount[];
}

function topN(counts: Map<string, number>, n: number): RankedCount[] {
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

function bump(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Breakdown of one event's raw occurrences by page, MX state, hour-of-day,
 * device, and referrer type — built for the "Detalle del embudo de
 * WhatsApp" section on `/conversiones`, but generic to any single event
 * name. Deliberately raw-count based (not deduped by `profile_id` like
 * `getUniqueLeadCount`) — this answers "where/when do clicks happen",
 * which is naturally a count of actions, not people; a lead who clicks
 * from the same page twice really did generate two data points about
 * that page's effectiveness.
 *
 * Hour-of-day is bucketed in `America/Mexico_City` (not the raw UTC
 * timestamp) since "what time do people click" is a local-business-hours
 * question — see `next.config.ts`/`Dockerfile`'s TZ handling for the same
 * reasoning applied elsewhere in this app.
 */
export async function getEventDetail(
  creds: OpenPanelCreds,
  range: DateRange,
  eventName: string,
): Promise<EventDetail> {
  const events = await getAllEvents(creds, range, eventName);

  const pathCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const deviceCounts = new Map<string, number>();
  const referrerCounts = new Map<string, number>();
  const hourCounts = new Array(24).fill(0) as number[];
  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    hourCycle: "h23",
  });

  for (const event of events) {
    bump(pathCounts, event.path || "(sin ruta)");
    bump(regionCounts, event.region || "Desconocido");
    bump(deviceCounts, event.device || "Desconocido");
    bump(referrerCounts, event.referrer_type || "Directo");

    // ClickHouse's DateTime string has no "Z"/offset — Date() would parse
    // it as local time to the *server process*, not necessarily UTC. Add
    // the "Z" explicitly since these timestamps are documented (and
    // verified) to be UTC.
    const utcDate = new Date(`${event.created_at.replace(" ", "T")}Z`);
    const localHour = Number(hourFormatter.format(utcDate));
    hourCounts[localHour] += 1;
  }

  let peakHour = 0;
  for (let h = 1; h < 24; h++) {
    if (hourCounts[h] > hourCounts[peakHour]) peakHour = h;
  }

  return {
    totalEvents: events.length,
    topPaths: topN(pathCounts, 10),
    topRegions: topN(regionCounts, 10),
    hourly: hourCounts.map((count, hour) => ({ hour, count })),
    peakHour,
    byDevice: topN(deviceCounts, 6),
    byReferrerType: topN(referrerCounts, 6),
  };
}

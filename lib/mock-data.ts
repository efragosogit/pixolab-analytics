/**
 * Simulated data for pages without a real source connected yet (SEO, Ads,
 * Social). Deterministic (seeded), not random-every-render — so numbers stay
 * stable across a session and look like plausible real analytics instead of
 * placeholder noise. NOT real data — every consumer of this module should
 * make that obvious in the UI (see the "Datos simulados" badge pattern used
 * on those pages).
 */
import type { DateRange } from "./openpanel";

// Small deterministic PRNG (mulberry32) so the same date range always
// produces the same "data" during a session.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromRange(range: DateRange, salt: string): number {
  const str = `${range.startDate}:${range.endDate}:${salt}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return h;
}

function daysBetween(range: DateRange): string[] {
  const days: string[] = [];
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days.length > 0 ? days : [range.startDate];
}

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

export interface SeoOverview {
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  clicksDelta: number;
  series: { date: string; clicks: number; impressions: number }[];
}

export interface SeoQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

const SEO_QUERIES = [
  "postes de concreto",
  "fabrica de postes puebla",
  "luminarias led para alumbrado publico",
  "poste conico circular precio",
  "base de concreto para poste",
  "postes para semaforos",
  "alumbrado publico led nom-001",
  "postes ornamentales",
  "brazo escuadra para farol",
  "poste de luz precio por metro",
  "instalacion alumbrado publico municipal",
  "postes de concreto armado",
];

export function getSeoOverview(client: string, range: DateRange): SeoOverview {
  const rand = mulberry32(seedFromRange(range, `${client}:seo`));
  const days = daysBetween(range);
  let clicks = 0;
  let impressions = 0;
  const series = days.map((date) => {
    const dayClicks = Math.round(18 + rand() * 22);
    const dayImpr = Math.round(dayClicks * (11 + rand() * 6));
    clicks += dayClicks;
    impressions += dayImpr;
    return { date, clicks: dayClicks, impressions: dayImpr };
  });
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    avgPosition: 8.2 + rand() * 4,
    clicksDelta: -8 + rand() * 30,
    series,
  };
}

export function getSeoQueries(range: DateRange): SeoQuery[] {
  const rand = mulberry32(seedFromRange(range, "seo-queries"));
  return SEO_QUERIES.map((query) => {
    const impressions = Math.round(200 + rand() * 2400);
    const ctr = 1.5 + rand() * 9;
    const clicks = Math.round((impressions * ctr) / 100);
    return {
      query,
      clicks,
      impressions,
      ctr,
      position: 1 + rand() * 18,
    };
  }).sort((a, b) => b.clicks - a.clicks);
}

// ---------------------------------------------------------------------------
// Ads / Publicidad
// ---------------------------------------------------------------------------

export interface AdsOverview {
  spend: number;
  conversions: number;
  cpa: number;
  roas: number;
  impressions: number;
  series: { date: string; spend: number; conversions: number; impressions: number }[];
}

export interface AdsCampaign {
  name: string;
  platform: "Google Ads" | "Meta Ads";
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number;
  roas: number;
}

const CAMPAIGNS: { name: string; platform: AdsCampaign["platform"] }[] = [
  { name: "Búsqueda — Postes de concreto", platform: "Google Ads" },
  { name: "Búsqueda — Luminarias LED", platform: "Google Ads" },
  { name: "Performance Max — Catálogo", platform: "Google Ads" },
  { name: "Remarketing — Visitantes de producto", platform: "Meta Ads" },
  { name: "Prospección — Municipios y constructoras", platform: "Meta Ads" },
];

export function getAdsOverview(client: string, range: DateRange): AdsOverview {
  const rand = mulberry32(seedFromRange(range, `${client}:ads`));
  const days = daysBetween(range);
  let spend = 0;
  let conversions = 0;
  let impressions = 0;
  const series = days.map((date) => {
    const daySpend = 450 + rand() * 650;
    const dayConv = Math.max(0, Math.round((daySpend / 380) * (0.6 + rand() * 0.8)));
    // Rough CPM-driven impressions from spend — plausible shape for the
    // journey indicator's top-of-funnel stage, not a real ad-platform metric.
    const dayImpr = Math.round(daySpend * (16 + rand() * 12));
    spend += daySpend;
    conversions += dayConv;
    impressions += dayImpr;
    return { date, spend: Math.round(daySpend), conversions: dayConv, impressions: dayImpr };
  });
  return {
    spend,
    conversions,
    cpa: conversions > 0 ? spend / conversions : 0,
    roas: 2.1 + rand() * 2.4,
    impressions,
    series,
  };
}

export function getAdsCampaigns(range: DateRange): AdsCampaign[] {
  const rand = mulberry32(seedFromRange(range, "ads-campaigns"));
  return CAMPAIGNS.map((c) => {
    const spend = Math.round(3000 + rand() * 9000);
    const clicks = Math.round(spend / (8 + rand() * 10));
    const conversions = Math.max(1, Math.round(clicks * (0.02 + rand() * 0.05)));
    return {
      ...c,
      spend,
      clicks,
      conversions,
      cpa: spend / conversions,
      roas: 1.4 + rand() * 3.2,
    };
  }).sort((a, b) => b.spend - a.spend);
}

// ---------------------------------------------------------------------------
// Social media
// ---------------------------------------------------------------------------

export interface SocialOverview {
  followers: number;
  followersDelta: number;
  engagementRate: number;
  reach: number;
  series: { date: string; reach: number; engagement: number }[];
}

export interface SocialPlatform {
  platform: "Instagram" | "Facebook" | "TikTok";
  followers: number;
  followersDelta: number;
  engagementRate: number;
}

export interface SocialPost {
  platform: SocialPlatform["platform"];
  caption: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
}

const POSTS: { platform: SocialPost["platform"]; caption: string }[] = [
  { platform: "Facebook", caption: "Nueva línea de postes ornamentales para fraccionamientos" },
  { platform: "Instagram", caption: "Proceso de fabricación: de la mezcla al poste terminado" },
  { platform: "Instagram", caption: "Antes y después: alumbrado municipal en Puebla" },
  { platform: "TikTok", caption: "¿Cuánto dura un poste de concreto? Te lo explicamos en 30s" },
  { platform: "Facebook", caption: "Certificación NOM-001 en todos nuestros productos" },
  { platform: "Instagram", caption: "Instalación de luminarias LED de alta eficiencia" },
];

export function getSocialOverview(client: string, range: DateRange): SocialOverview {
  const rand = mulberry32(seedFromRange(range, `${client}:social`));
  const days = daysBetween(range);
  let reach = 0;
  const series = days.map((date) => {
    const dayReach = Math.round(400 + rand() * 900);
    const dayEngagement = Math.round(dayReach * (0.03 + rand() * 0.06));
    reach += dayReach;
    return { date, reach: dayReach, engagement: dayEngagement };
  });
  return {
    followers: 4820 + Math.round(rand() * 400),
    followersDelta: 1 + rand() * 6,
    engagementRate: 2.8 + rand() * 3.4,
    reach,
    series,
  };
}

export function getSocialPlatforms(client: string, range: DateRange): SocialPlatform[] {
  const rand = mulberry32(seedFromRange(range, `${client}:social-platforms`));
  const platforms: SocialPlatform["platform"][] = ["Instagram", "Facebook", "TikTok"];
  return platforms.map((platform) => ({
    platform,
    followers: Math.round(900 + rand() * 3200),
    followersDelta: -2 + rand() * 10,
    engagementRate: 1.5 + rand() * 5,
  }));
}

export function getSocialPosts(client: string, range: DateRange): SocialPost[] {
  const rand = mulberry32(seedFromRange(range, `${client}:social-posts`));
  return POSTS.map((p) => {
    const reach = Math.round(600 + rand() * 5400);
    return {
      ...p,
      reach,
      likes: Math.round(reach * (0.03 + rand() * 0.07)),
      comments: Math.round(reach * (0.002 + rand() * 0.01)),
      shares: Math.round(reach * (0.001 + rand() * 0.006)),
    };
  }).sort((a, b) => b.reach - a.reach);
}

// ---------------------------------------------------------------------------
// ROI (Paid media) — simulated until the CRM (Twenty) is cross-referenced
// against real ad spend to know which closed sales actually came from which
// campaign/month. See CLAUDE.md "Not yet done" for the same caveat already
// documented for the Leads→CRM link on the Funnels page.
// ---------------------------------------------------------------------------

export interface RoiCampaignBreakdown {
  name: string;
  spend: number;
  leads: number;
  conversions: number;
  sales: number;
}

export interface RoiMonth {
  /** "2026-07" — the page formats this into a locale label, not this file. */
  key: string;
  adSpend: number;
  adClicks: number;
  leads: number;
  conversions: number;
  totalSales: number;
  campaigns: RoiCampaignBreakdown[];
}

export interface RoiHistory {
  /** Chronological, oldest first — matches the reference layout the client shared. */
  months: RoiMonth[];
  totalAdSpend: number;
  totalLeads: number;
  totalConversions: number;
  totalSales: number;
  roas: number;
}

const ROI_CAMPAIGNS = [
  "Búsqueda — Postes de concreto",
  "Performance Max — Catálogo",
  "Remarketing — Visitantes de producto",
  "Prospección — Municipios y constructoras",
];

/**
 * Every month is seeded by its own key (`client:roi:2026-07`), not by the
 * selected date range — a "historial" should show the same numbers for
 * July regardless of whether you're viewing it through a 3-month or a
 * 12-month window, unlike the other generators here (SEO/Ads/Social),
 * which intentionally reseed per range since they only ever show one
 * period's totals, never a fixed calendar timeline.
 */
function seedMonth(client: string, key: string): () => number {
  return mulberry32(seedFromRange({ startDate: key, endDate: key }, `${client}:roi`));
}

/**
 * `monthCount` calendar months ending on the month of `range.endDate` —
 * moving the global date-range picker's end date shifts which months
 * appear (so the page still "respects the date range" per this app's
 * convention) without needing real per-day granularity, which a monthly
 * sales historial doesn't have anyway.
 */
export function getRoiHistory(client: string, range: DateRange, monthCount = 12): RoiHistory {
  const anchor = new Date(`${range.endDate}T00:00:00Z`);
  const monthKeys: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const months: RoiMonth[] = monthKeys.map((key) => {
    const rand = seedMonth(client, key);
    const adSpend = Math.round(2500 + rand() * 6500);
    const adClicks = Math.round(adSpend / (4 + rand() * 4));
    const leads = Math.max(1, Math.round(adClicks * (0.02 + rand() * 0.05)));
    const conversions = Math.max(0, Math.round(leads * (0.2 + rand() * 0.4)));
    // Total sales is derived directly from ad spend via a plausible ROAS
    // band (3x–12x — a B2B ticket-size business like this client's can
    // genuinely run high ROAS), NOT from conversions × avg ticket — that
    // compounds three independent random factors and produced wildly
    // unrealistic ROAS outliers (80x+) during testing.
    const roasThisMonth = 3 + rand() * 9;
    const totalSales = Math.round(adSpend * roasThisMonth);

    // Split the month's totals across a fixed campaign list — the last
    // campaign absorbs the remainder so the breakdown always sums exactly
    // to the month's own numbers instead of drifting from rounding.
    let remainingSpend = adSpend;
    let remainingLeads = leads;
    let remainingConversions = conversions;
    let remainingSales = totalSales;
    const campaigns: RoiCampaignBreakdown[] = ROI_CAMPAIGNS.map((name, i) => {
      const isLast = i === ROI_CAMPAIGNS.length - 1;
      const share = 0.15 + rand() * 0.3;
      const spend = isLast ? remainingSpend : Math.round(adSpend * share);
      const campLeads = isLast ? remainingLeads : Math.round(leads * share);
      const campConversions = isLast ? remainingConversions : Math.round(conversions * share);
      const sales = isLast ? remainingSales : Math.round(totalSales * share);
      remainingSpend -= spend;
      remainingLeads -= campLeads;
      remainingConversions -= campConversions;
      remainingSales -= sales;
      return { name, spend, leads: campLeads, conversions: campConversions, sales };
    });

    return { key, adSpend, adClicks, leads, conversions, totalSales, campaigns };
  });

  const totalAdSpend = months.reduce((s, m) => s + m.adSpend, 0);
  const totalLeads = months.reduce((s, m) => s + m.leads, 0);
  const totalConversions = months.reduce((s, m) => s + m.conversions, 0);
  const totalSales = months.reduce((s, m) => s + m.totalSales, 0);

  return {
    months,
    totalAdSpend,
    totalLeads,
    totalConversions,
    totalSales,
    roas: totalAdSpend > 0 ? totalSales / totalAdSpend : 0,
  };
}

// ---------------------------------------------------------------------------
// Leads (prospects table) — simulated until the real capture pipeline (GTM
// → dashboard webhook → database) is decided and built. See CLAUDE.md
// "Not yet done" for why this stays mocked even though the underlying
// conversion counts on the Conversiones page are real. WhatsApp
// deliberately excluded as a source — no CRM access to those
// conversations.
// ---------------------------------------------------------------------------

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: "Formulario de contacto" | "Descarga de catálogo";
  page: string;
  date: string; // YYYY-MM-DD
  detail: string;
}

const FIRST_NAMES = [
  "José Luis", "María Fernanda", "Carlos", "Guadalupe", "Alejandro",
  "Ana Sofía", "Miguel Ángel", "Daniela", "Francisco", "Alejandra",
  "Jorge", "Paola", "Ricardo", "Cynthia", "Eduardo", "Karla",
  "Sergio", "Mariana", "Antonio", "Fernanda",
];
const LAST_NAMES = [
  "Hernández", "García", "Martínez", "López", "González", "Pérez",
  "Sánchez", "Ramírez", "Flores", "Torres", "Vázquez", "Rojas",
  "Mendoza", "Cruz", "Reyes", "Morales", "Ortiz", "Gutiérrez",
];

const CONTACT_MESSAGES = [
  "¿Manejan postes de 9 metros para alumbrado municipal?",
  "Necesito cotización para 40 postes cónicos, proyecto en Puebla.",
  "¿Tienen certificación NOM-001 en sus productos?",
  "Quisiera saber tiempos de entrega para base de concreto.",
  "¿Hacen envíos fuera de Puebla?",
  "Busco precio por mayoreo para constructora.",
  "¿Cuál es la garantía de los postes ornamentales?",
  "Necesito ficha técnica de luminarias LED.",
];

const CATALOG_INTERESTS = [
  "Postes de concreto",
  "Luminarias LED",
  "Postes ornamentales",
  "Bases de concreto",
  "Brazos y escuadras",
  "Catálogo completo",
];

function randomFrom<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function slugifyForEmail(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .join(".");
}

const EMAIL_DOMAINS = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com.mx"];

/**
 * Simulated leads across both form sources — not derived from the real
 * form_submitted/catalog_download counts on the Conversiones page, this is
 * an independent simulated dataset until a real capture pipeline exists.
 */
export function getLeads(range: DateRange): Lead[] {
  const rand = mulberry32(seedFromRange(range, "leads"));
  const days = daysBetween(range);
  const leads: Lead[] = [];

  for (const date of days) {
    const contactCount = rand() < 0.55 ? Math.floor(1 + rand() * 2) : 0;
    for (let i = 0; i < contactCount; i++) {
      const name = `${randomFrom(rand, FIRST_NAMES)} ${randomFrom(rand, LAST_NAMES)}`;
      leads.push({
        id: `${date}-contacto-${i}`,
        name,
        email: `${slugifyForEmail(name)}@${randomFrom(rand, EMAIL_DOMAINS)}`,
        phone: `222 ${Math.floor(100 + rand() * 900)} ${Math.floor(1000 + rand() * 9000)}`,
        source: "Formulario de contacto",
        page: "/contactanos",
        date,
        detail: randomFrom(rand, CONTACT_MESSAGES),
      });
    }

    const catalogCount = rand() < 0.5 ? Math.floor(1 + rand() * 2) : 0;
    for (let i = 0; i < catalogCount; i++) {
      const name = `${randomFrom(rand, FIRST_NAMES)} ${randomFrom(rand, LAST_NAMES)}`;
      leads.push({
        id: `${date}-catalogo-${i}`,
        name,
        email: `${slugifyForEmail(name)}@${randomFrom(rand, EMAIL_DOMAINS)}`,
        phone: `222 ${Math.floor(100 + rand() * 900)} ${Math.floor(1000 + rand() * 9000)}`,
        source: "Descarga de catálogo",
        page: "/catalogo-lumi",
        date,
        detail: randomFrom(rand, CATALOG_INTERESTS),
      });
    }
  }

  return leads.sort((a, b) => b.date.localeCompare(a.date));
}

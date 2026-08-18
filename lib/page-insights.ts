/**
 * Human-readable recommendations derived from one page's
 * `/pages/performance` metrics (`lib/openpanel.ts`'s `PagePerformance`).
 * Pure/no I/O — safe to import from a Client Component, which is exactly
 * how `components/page-detail-modal.tsx` uses it (computed at render
 * time, no extra fetch needed).
 *
 * Thresholds mirror the ones already color-coding the bounce column on
 * `/performance`'s table (>=75 critical, >=55 warning) rather than
 * inventing new ones — `seo_signals.*` come pre-computed from OpenPanel
 * itself and are treated as authoritative flags, not re-derived here.
 */
import type { PagePerformance } from "./openpanel";

export type InsightTone = "critical" | "warning" | "good" | "info";

export interface PageInsight {
  tone: InsightTone;
  text: string;
}

const MIN_SESSIONS_FOR_DURATION_SIGNAL = 3;
const SHORT_DURATION_SECONDS = 15;
const LOW_TRAFFIC_SESSIONS = 5;

export function getPageInsights(page: PagePerformance): PageInsight[] {
  const insights: PageInsight[] = [];
  const bounce = page.bounce_rate;

  if (page.seo_signals.high_bounce || bounce >= 75) {
    insights.push({
      tone: "critical",
      text: `Bounce rate crítico (${bounce.toFixed(0)}%) — la mayoría se va sin interactuar. Revisa que el contenido cumpla lo que promete el título/meta y que la página cargue rápido.`,
    });
  } else if (bounce >= 55) {
    insights.push({
      tone: "warning",
      text: `Bounce rate elevado (${bounce.toFixed(0)}%) — agrega enlaces internos, contenido relacionado o un CTA más visible para retener al visitante.`,
    });
  }

  if (page.seo_signals.low_engagement) {
    insights.push({
      tone: "warning",
      text: "Bajo engagement detectado por OpenPanel — los visitantes interactúan poco; revisa la claridad del contenido y las llamadas a la acción.",
    });
  }

  if (
    page.avg_duration < SHORT_DURATION_SECONDS &&
    page.sessions >= MIN_SESSIONS_FOR_DURATION_SIGNAL
  ) {
    insights.push({
      tone: "warning",
      text: `Tiempo en página muy corto (${page.avg_duration.toFixed(0)}s) — el visitante decide irse casi de inmediato; el copy inicial o el hero puede no estar conectando.`,
    });
  }

  if (page.seo_signals.good_landing_page) {
    insights.push({
      tone: "good",
      text: "Buena landing page — retiene bien a los visitantes, es un buen destino para tráfico pagado u orgánico.",
    });
  }

  if (page.sessions < LOW_TRAFFIC_SESSIONS) {
    insights.push({
      tone: "info",
      text: `Tráfico bajo en este período (${page.sessions} ${page.sessions === 1 ? "sesión" : "sesiones"}) — antes de optimizar conversión, esta página se beneficia más de visibilidad (SEO, enlaces internos, promoción).`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      tone: "good",
      text: "Sin señales de alerta relevantes en este período — el rendimiento de esta página luce saludable.",
    });
  }

  // Most severe first; cap so the modal stays scannable, not a wall of text.
  const severity: Record<InsightTone, number> = { critical: 0, warning: 1, info: 2, good: 3 };
  return insights.sort((a, b) => severity[a.tone] - severity[b.tone]).slice(0, 4);
}

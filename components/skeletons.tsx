/**
 * Loading-skeleton building blocks for every route's `loading.tsx`.
 * Server Components (no "use client") — purely static markup, Next.js
 * shows these automatically as the Suspense fallback while a route's
 * async page.tsx is still fetching (OpenPanel/GSC/Google Ads/Postgres),
 * so there's real structural feedback on click instead of the page
 * appearing to do nothing until data arrives. See app/globals.css's
 * `.skeleton` utility for the shimmer animation itself.
 *
 * Shapes here deliberately mirror components/ui-kit.tsx's real
 * PageHeader/StatCard/Section (same border/radius/padding tokens) so the
 * swap from skeleton → real content doesn't visually jump.
 */

function Bar({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`skeleton rounded-md ${className}`} style={style} />;
}

export function SkeletonPageHeader() {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-2.5">
        <Bar className="h-3 w-40" />
        <Bar className="h-9 w-64" />
        <Bar className="h-4 w-full max-w-xl" />
      </div>
      <Bar className="h-6 w-32 shrink-0 rounded-full" />
    </div>
  );
}

function SkeletonStatCard() {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 px-5 py-5">
      <div className="flex flex-col gap-2.5">
        <Bar className="h-3 w-20" />
        <Bar className="h-8 w-24" />
        <Bar className="h-3 w-28" />
      </div>
    </div>
  );
}

/**
 * No grid wrapper of its own on purpose — real pages use different
 * responsive column counts per stat-card row (5 on the home page, 4 on
 * SEO/Ads, 3 on Leads), so the caller's own `<section className="grid
 * ...">` (copied straight from that page) wraps this instead of a
 * generic one that wouldn't match.
 */
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </>
  );
}

export function SkeletonCard({
  title = true,
  children,
}: {
  title?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-5">
      {title && <Bar className="mb-4 h-3 w-40" />}
      {children}
    </div>
  );
}

export function SkeletonChartCard({ height = 220 }: { height?: number }) {
  return (
    <SkeletonCard>
      <Bar className="w-full" style={{ height }} />
    </SkeletonCard>
  );
}

export function SkeletonBars({ rows = 6 }: { rows?: number }) {
  return (
    <SkeletonCard>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bar className="h-3.5 w-24 shrink-0" />
            <Bar className="h-6 flex-1" />
            <Bar className="h-3.5 w-8 shrink-0" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-5">
      <div className="flex flex-col gap-4">
        <div className="flex gap-4 border-b border-border/60 pb-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Bar key={i} className={`h-3 ${i === 0 ? "w-32 flex-1" : "w-16"}`} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Bar key={c} className={`h-4 ${c === 0 ? "w-40 flex-1" : "w-14"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Journey-indicator-shaped skeleton (Impresiones → Tráfico → Leads). */
export function SkeletonJourney({ stages = 3 }: { stages?: number }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-3">
      {Array.from({ length: stages }).map((_, i) => (
        <div key={i} className="bg-card/70 p-5">
          <div className="flex flex-col gap-2.5">
            <Bar className="h-3 w-20" />
            <Bar className="h-9 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Funnel-card-shaped skeleton (StageFunnel: title + rate + 3 stacked bars). */
export function SkeletonFunnelCard() {
  return (
    <SkeletonCard>
      <div className="mb-5 flex items-baseline gap-6">
        <Bar className="h-9 w-20" />
        <Bar className="h-5 w-24" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Bar key={i} className="h-11 w-full" />
        ))}
      </div>
    </SkeletonCard>
  );
}

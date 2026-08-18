"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const GRID = "var(--border)";
const AXIS = "var(--muted-foreground)";

/**
 * Value formats as a serializable string — NOT a function prop. These charts
 * are Client Components; a function passed down from a Server Component page
 * would trip Next's "functions cannot be passed to Client Components" error.
 */
export type ValueFormat = "number" | "compact" | "currency" | "percent";

function formatValue(v: number, fmt: ValueFormat = "number"): string {
  switch (fmt) {
    case "compact":
      return Intl.NumberFormat("es-MX", { notation: "compact" }).format(v);
    case "currency":
      return v.toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN",
        maximumFractionDigits: 0,
      });
    case "percent":
      return `${v.toFixed(1)}%`;
    default:
      return v.toLocaleString("es-MX");
  }
}

function formatDateTick(v: string): string {
  try {
    return format(parseISO(v), "d MMM", { locale: es });
  } catch {
    return v;
  }
}

function ChartTooltip({
  active,
  payload,
  label,
  format: fmt,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  format?: ValueFormat;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-popover/95 px-3 py-2 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur-sm">
      {label && (
        <div className="mb-1 text-xs text-muted-foreground">{formatDateTick(label)}</div>
      )}
      <div className="flex flex-col gap-0.5">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-foreground/70">{p.name}</span>
            <span className="tabular ml-auto font-medium text-foreground">
              {formatValue(p.value, fmt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Single-series area trend — the default chart for "one metric over time". */
export function TrendArea({
  data,
  dataKey,
  xKey = "date",
  color = "var(--chart-1)",
  format: fmt = "number",
  height = 220,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  xKey?: string;
  color?: string;
  format?: ValueFormat;
  height?: number;
}) {
  const gradientId = `grad-${dataKey.replace(/\s+/g, "-")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey={xKey}
          tickFormatter={formatDateTick}
          tick={{ fill: AXIS, fontSize: 11 }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          minTickGap={32}
        />
        <YAxis
          tick={{ fill: AXIS, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v: number) => formatValue(v, fmt)}
        />
        <Tooltip
          content={<ChartTooltip format={fmt} />}
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 3.5, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Two-series line trend — only for metrics that legitimately share one axis/unit. */
export function TrendLines({
  data,
  series,
  xKey = "date",
  format: fmt = "number",
  height = 240,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string; color: string }[];
  xKey?: string;
  format?: ValueFormat;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey={xKey}
          tickFormatter={formatDateTick}
          tick={{ fill: AXIS, fontSize: 11 }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          minTickGap={32}
        />
        <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          content={<ChartTooltip format={fmt} />}
          cursor={{ stroke: "var(--muted-foreground)" }}
        />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="circle"
          iconSize={6}
          formatter={(value) => <span className="text-xs text-foreground/70">{value}</span>}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranked bar list — the default for "top N categories" rankings. */
export function RankedBars({
  rows,
  format: fmt = "number",
  color = "var(--chart-1)",
  onRowClick,
}: {
  rows: { label: string; value: number }[];
  format?: ValueFormat;
  color?: string;
  /**
   * Optional — when given, every row becomes a clickable button that
   * calls this with the row's `label` (e.g. to open a detail modal keyed
   * by that label). Rows stay plain, non-interactive divs when omitted,
   * so this is opt-in per usage, not a behavior change for the many
   * other RankedBars call sites (top states, devices, referrers, …).
   */
  onRowClick?: (label: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">Sin datos en este rango.</p>
    );
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <div
          key={row.label}
          role={onRowClick ? "button" : undefined}
          tabIndex={onRowClick ? 0 : undefined}
          onClick={onRowClick ? () => onRowClick(row.label) : undefined}
          onKeyDown={
            onRowClick
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(row.label);
                  }
                }
              : undefined
          }
          className={`flex w-full items-center gap-3 ${onRowClick ? "cursor-pointer rounded-md transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" : ""}`}
        >
          <div className="w-32 shrink-0 truncate text-xs text-foreground/70" title={row.label}>
            {row.label}
          </div>
          <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted/50">
            <div
              className="h-full rounded-md transition-all"
              style={{
                width: `${Math.max((row.value / max) * 100, 3)}%`,
                // `${color}55` (hex-alpha suffix) only works when `color`
                // is itself a hex literal — every caller here passes a
                // `var(--chart-N)` CSS custom-property reference instead,
                // and `var(--chart-1)55` is invalid CSS, so the browser
                // silently drops the whole `background` declaration and
                // the bar renders with no visible fill at all (confirmed
                // live 2026-08-17 — every RankedBars usage in the app was
                // affected, not just the new WhatsApp detail cards).
                // `color-mix()` blends correctly regardless of whether
                // `color` is a var() reference or a literal.
                background: `linear-gradient(90deg, color-mix(in oklab, ${color} 35%, transparent), ${color})`,
              }}
            />
          </div>
          <div className="tabular w-16 shrink-0 text-right text-xs font-medium text-foreground">
            {formatValue(row.value, fmt)}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Stacked daily bars — for a count metric made of a few summable segments
 * over time (e.g. leads by source, per day). Series order is the fixed
 * categorical order from the design system (`--chart-1`, `--chart-2`, …),
 * never reassigned per render. Each segment gets a thin surface-color
 * stroke as the 2px gap between stacked fills, and only the topmost
 * segment gets rounded corners, per the dataviz skill's mark spec.
 */
export function StackedBars({
  data,
  series,
  xKey = "date",
  height = 220,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string; color: string }[];
  xKey?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey={xKey}
          tickFormatter={formatDateTick}
          tick={{ fill: AXIS, fontSize: 11 }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          minTickGap={32}
        />
        <YAxis
          tick={{ fill: AXIS, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={36}
          allowDecimals={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent)" }} />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="circle"
          iconSize={6}
          formatter={(value) => <span className="text-xs text-foreground/70">{value}</span>}
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="stack"
            fill={s.color}
            stroke="var(--card)"
            strokeWidth={2}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
            maxBarSize={28}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Small vertical bar comparison — for a handful of categories (devices, platforms). */
export function CategoryBars({
  data,
  dataKey,
  nameKey = "name",
  colors,
  height = 180,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  nameKey?: string;
  colors: string[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey={nameKey}
          tick={{ fill: AXIS, fontSize: 11 }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent)" }} />
        <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

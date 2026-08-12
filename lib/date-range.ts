import {
  differenceInCalendarDays,
  endOfMonth,
  endOfYesterday,
  format,
  parseISO,
  startOfMonth,
  startOfToday,
  startOfYesterday,
  subDays,
  subMonths,
} from "date-fns";
import type { DateRange as OpenPanelRange } from "./openpanel";

export type Preset =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "this_month"
  | "last_month"
  | "3m"
  | "custom";

export const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes pasado" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "custom", label: "Personalizado" },
];

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

export function rangeForPreset(preset: Preset): OpenPanelRange {
  const today = startOfToday();
  switch (preset) {
    case "today":
      return { startDate: fmt(today), endDate: fmt(today) };
    case "yesterday":
      return { startDate: fmt(startOfYesterday()), endDate: fmt(endOfYesterday()) };
    case "7d":
      return { startDate: fmt(subDays(today, 6)), endDate: fmt(today) };
    case "this_month":
      return { startDate: fmt(startOfMonth(today)), endDate: fmt(today) };
    case "last_month": {
      const lastMonth = subMonths(today, 1);
      return {
        startDate: fmt(startOfMonth(lastMonth)),
        endDate: fmt(endOfMonth(lastMonth)),
      };
    }
    case "3m":
      return { startDate: fmt(subMonths(today, 3)), endDate: fmt(today) };
    case "30d":
    default:
      return { startDate: fmt(subDays(today, 29)), endDate: fmt(today) };
  }
}

export type ResolvedRange = OpenPanelRange & { preset: Preset; label: string };

/** Reads `?period=<preset>` or `?from=YYYY-MM-DD&to=YYYY-MM-DD` from page searchParams. */
export function resolveRange(
  searchParams: Record<string, string | string[] | undefined>,
): ResolvedRange {
  const from = typeof searchParams.from === "string" ? searchParams.from : undefined;
  const to = typeof searchParams.to === "string" ? searchParams.to : undefined;

  if (from && to) {
    return { startDate: from, endDate: to, preset: "custom", label: "Personalizado" };
  }

  const presetParam = typeof searchParams.period === "string" ? searchParams.period : "30d";
  const preset = (PRESETS.some((p) => p.value === presetParam) ? presetParam : "30d") as Preset;
  const label = PRESETS.find((p) => p.value === preset)?.label ?? "Últimos 30 días";
  return { ...rangeForPreset(preset), preset, label };
}

/** The immediately preceding period of the same length, for delta comparisons. */
export function previousRange(range: OpenPanelRange): OpenPanelRange {
  const start = parseISO(range.startDate);
  const end = parseISO(range.endDate);
  const lengthDays = differenceInCalendarDays(end, start) + 1;
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, lengthDays - 1);
  return { startDate: fmt(prevStart), endDate: fmt(prevEnd) };
}

export function percentDelta(current: number, previous: number): number | undefined {
  if (!previous) return undefined;
  return ((current - previous) / previous) * 100;
}

export function formatRangeLabel(range: ResolvedRange): string {
  if (range.preset !== "custom") return range.label;
  return `${format(parseISO(range.startDate), "d MMM")} — ${format(parseISO(range.endDate), "d MMM yyyy")}`;
}

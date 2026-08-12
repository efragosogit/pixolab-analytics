import { ArrowRightIcon } from "lucide-react";

export interface JourneyStage {
  label: string;
  value: number;
  simulated?: boolean;
  hint?: string;
}

/**
 * High-level marketing funnel: Impresiones → Tráfico → Leads. Deliberately
 * coarser than the per-event `FunnelCard`s below it on the Leads page —
 * this blends a simulated top-of-funnel number (ad + SEO impressions,
 * no real source connected) with two real OpenPanel numbers (visitors,
 * lead events), so each stage that isn't real data says so explicitly.
 */
export function JourneyIndicator({ stages }: { stages: JourneyStage[] }) {
  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card/70 sm:flex-row sm:divide-x sm:divide-y-0">
      {stages.map((stage, i) => {
        const prev = stages[i - 1];
        const conversion = prev && prev.value > 0 ? (stage.value / prev.value) * 100 : null;
        return (
          <div key={stage.label} className="relative flex-1 p-5">
            {i > 0 && (
              <div className="absolute -left-3.5 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-center gap-0.5 rounded-full border border-border bg-card px-1.5 py-1 sm:flex">
                <ArrowRightIcon className="size-3 text-muted-foreground" />
                {conversion !== null && (
                  <span className="tabular text-[10px] font-medium text-foreground/70">
                    {conversion.toFixed(1)}%
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {stage.label}
              </span>
              {stage.simulated && (
                <span className="rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  simulado
                </span>
              )}
            </div>
            <div className="tabular mt-1.5 text-2xl font-semibold leading-none text-foreground sm:text-3xl">
              {stage.value.toLocaleString("es-MX")}
            </div>
            {i > 0 && conversion !== null && (
              <div className="tabular mt-1.5 text-xs text-muted-foreground sm:hidden">
                {conversion.toFixed(1)}% vs. {prev.label.toLowerCase()}
              </div>
            )}
            {stage.hint && (
              <p className="mt-1 text-xs text-muted-foreground">{stage.hint}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

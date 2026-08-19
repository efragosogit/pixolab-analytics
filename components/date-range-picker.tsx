"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, ChevronDownIcon, CheckIcon } from "lucide-react";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PRESETS, formatRangeLabel, resolveRange, type Preset } from "@/lib/date-range";

export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const params = Object.fromEntries(searchParams.entries());
  const current = resolveRange(params);

  const [draft, setDraft] = useState<DayPickerRange | undefined>(
    current.preset === "custom"
      ? { from: parseISO(current.startDate), to: parseISO(current.endDate) }
      : undefined,
  );

  function applyPreset(preset: Preset) {
    if (preset === "custom") return;
    const next = new URLSearchParams();
    next.set("period", preset);
    router.push(`${pathname}?${next.toString()}`);
    setOpen(false);
  }

  function applyCustom() {
    if (!draft?.from || !draft?.to) return;
    const next = new URLSearchParams();
    next.set("from", format(draft.from, "yyyy-MM-dd"));
    next.set("to", format(draft.to, "yyyy-MM-dd"));
    router.push(`${pathname}?${next.toString()}`);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "lg" }),
          "gap-1.5 border-border/70 bg-card/60 pl-2.5 pr-2 font-normal text-foreground/90 hover:bg-accent hover:text-foreground sm:gap-2 sm:pl-3 sm:pr-2.5",
        )}
      >
        <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
        {/* Full label at sm+; capped/truncated on mobile so this one
            button can't reopen the topbar-overflow bug on a long custom
            range label — see Topbar's own comment for what that broke. */}
        <span className="tabular max-w-[92px] truncate text-sm sm:max-w-none">
          {formatRangeLabel(current)}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-auto overflow-hidden border-border/70 bg-popover p-0 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]"
      >
        <div className="flex w-44 flex-col gap-0.5 border-r border-border/60 p-2">
          <span className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Períodos
          </span>
          {PRESETS.map((p) => {
            const active = current.preset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => applyPreset(p.value)}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-foreground/80 hover:bg-accent",
                )}
              >
                {p.label}
                {active && <CheckIcon className="size-3.5" />}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col">
          <Calendar
            mode="range"
            locale={es}
            numberOfMonths={2}
            defaultMonth={draft?.from}
            selected={draft}
            onSelect={setDraft}
            className="p-3"
          />
          <div className="flex items-center justify-between gap-3 border-t border-border/60 p-3">
            <span className="tabular text-xs text-muted-foreground">
              {draft?.from ? format(draft.from, "d MMM yyyy", { locale: es }) : "—"}
              {" → "}
              {draft?.to ? format(draft.to, "d MMM yyyy", { locale: es }) : "—"}
            </span>
            <Button
              size="sm"
              disabled={!draft?.from || !draft?.to}
              onClick={applyCustom}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Aplicar rango
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

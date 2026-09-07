"use client";

import { WrenchIcon } from "lucide-react";
import type { RoiMonth } from "@/lib/mock-data";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const currency = (v: number) =>
  v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/**
 * "Ver detalles" per row on the ROI historial table — a dashed-outline
 * trigger matching the reference screenshot the client shared, opening a
 * per-campaign breakdown of that month's simulated numbers (see
 * `getRoiHistory`'s doc comment: the campaigns always sum exactly to the
 * month's own totals, no rounding drift).
 */
export function RoiMonthDetail({ month, label }: { month: RoiMonth; label: string }) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-1.5 border-dashed text-xs",
        )}
      >
        <WrenchIcon className="size-3.5" />
        Ver detalles
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">{label}</DialogTitle>
          <DialogDescription>
            Desglose simulado por campaña — spend, leads, conversiones y ventas suman
            exactamente el total del mes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col divide-y divide-border/60">
          {month.campaigns.map((c) => (
            <div key={c.name} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <span className="text-sm font-medium text-foreground">{c.name}</span>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Spend</div>
                  <div className="tabular font-medium text-foreground">{currency(c.spend)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Leads</div>
                  <div className="tabular font-medium text-foreground">{c.leads}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Conv.</div>
                  <div className="tabular font-medium text-foreground">{c.conversions}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Ventas</div>
                  <div className="tabular font-medium text-status-good">
                    {currency(c.sales)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

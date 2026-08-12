"use client";

import { useState, useTransition } from "react";
import { MailIcon, PhoneIcon, FileTextIcon } from "lucide-react";
import { saveLeadQualification } from "@/app/(dashboard)/[client]/leads/actions";
import type { LeadDisplay, QualityRating } from "@/lib/leads-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const RATING_OPTIONS: { value: QualityRating; label: string }[] = [
  { value: 1, label: "1 — Descartado" },
  { value: 2, label: "2 — Frío" },
  { value: 3, label: "3 — Tibio" },
  { value: 4, label: "4 — Caliente" },
  { value: 5, label: "5 — Muy caliente" },
];

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
    {children}
  </span>
);

export function LeadDetailModal({
  client,
  lead,
  open,
  onOpenChange,
}: {
  client: string;
  lead: LeadDisplay | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rating, setRating] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [qualifiedBy, setQualifiedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset the form whenever a (possibly different) lead opens — done
  // during render (React's documented pattern for "adjusting state when a
  // prop changes"), not a useEffect, so there's no extra render pass.
  const [syncedLeadId, setSyncedLeadId] = useState<string | null>(null);
  if (lead && lead.id !== syncedLeadId) {
    setSyncedLeadId(lead.id);
    setRating(lead.qualityRating ? String(lead.qualityRating) : "");
    setNotes(lead.qualifierNotes ?? "");
    setQualifiedBy(lead.qualifiedBy ?? "");
    setError(null);
  }

  if (!lead) return null;

  function handleSave() {
    const ratingValue = rating ? ((Number(rating) as QualityRating) ?? null) : null;
    startTransition(async () => {
      const result = await saveLeadQualification(client, lead!.id, ratingValue, notes, qualifiedBy);
      if (result.ok) {
        onOpenChange(false);
      } else {
        setError(result.error ?? "Error desconocido al guardar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{lead.name}</DialogTitle>
          <DialogDescription>
            {lead.source} · {dateTimeFormatter.format(new Date(lead.date))}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 text-sm text-foreground/80">
          <span className="flex items-center gap-2">
            <MailIcon className="size-3.5 shrink-0 text-muted-foreground" />
            {lead.email}
          </span>
          <span className="flex items-center gap-2">
            <PhoneIcon className="size-3.5 shrink-0 text-muted-foreground" />
            {lead.phone}
          </span>
          {lead.detail && lead.detail !== "(sin mensaje)" && (
            <span className="flex items-start gap-2">
              <FileTextIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span>{lead.detail}</span>
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
          <div>
            <FieldLabel>Calificación</FieldLabel>
            <Select value={rating} onValueChange={(v) => setRating(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin calificar">
                  {(value: string | null) =>
                    RATING_OPTIONS.find((o) => String(o.value) === value)?.label ?? "Sin calificar"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RATING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <FieldLabel>Observaciones</FieldLabel>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contexto de la llamada/contacto, próximos pasos, etc."
              rows={3}
            />
          </div>

          <div>
            <FieldLabel>Calificado por</FieldLabel>
            <Input
              value={qualifiedBy}
              onChange={(e) => setQualifiedBy(e.target.value)}
              placeholder="Tu nombre"
            />
          </div>

          {lead.qualifiedAt && (
            <p className="text-xs text-muted-foreground">
              Última calificación: {dateTimeFormatter.format(new Date(lead.qualifiedAt))}
            </p>
          )}

          {error && <p className="text-xs text-status-critical">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Loader2Icon,
  MousePointerClickIcon,
  PlusIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react";
import {
  type SettingsActionResult,
  saveConversionsAction,
} from "@/app/(dashboard)/[client]/configuracion/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Kind = "event" | "form";

interface Row {
  /** Stable React key only — not persisted. */
  uid: string;
  kind: Kind;
  key: string;
  label: string;
  pagePath: string;
  /** Whether `key` was typed by hand (then a label edit no longer rewrites it). */
  keyTouched: boolean;
}

const KIND_LABEL: Record<Kind, string> = {
  event: "Evento de OpenPanel",
  form: "Formulario (webhook)",
};

/** "Clic a WhatsApp" → "clic_a_whatsapp" — only a suggestion for new rows. */
function keyFromLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

let uidCounter = 0;
const nextUid = () => `row-${++uidCounter}`;

/**
 * Editor for the client's `client_conversions` — the list that defines
 * what the Funnels and Leads pages count as a lead (see
 * db/migrations/006_client_settings.sql for what each kind means). Saves
 * the whole list at once, in display order.
 */
export function ConversionsEditor({
  client,
  conversions,
}: {
  client: string;
  conversions: { kind: Kind; key: string; label: string; pagePath: string | null }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    conversions.map((c) => ({
      uid: nextUid(),
      kind: c.kind,
      key: c.key,
      label: c.label,
      pagePath: c.pagePath ?? "",
      keyTouched: true,
    })),
  );
  const [result, setResult] = useState<SettingsActionResult | null>(null);
  const [saving, startSave] = useTransition();

  function update(uid: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((r) => {
        if (r.uid !== uid) return r;
        const next = { ...r, ...patch };
        if (patch.label !== undefined && !r.keyTouched) next.key = keyFromLabel(patch.label);
        return next;
      }),
    );
  }

  function add(kind: Kind) {
    setRows((current) => [
      ...current,
      { uid: nextUid(), kind, key: "", label: "", pagePath: "", keyTouched: false },
    ]);
  }

  function move(index: number, delta: number) {
    setRows((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
      return copy;
    });
  }

  function save() {
    setResult(null);
    startSave(async () => {
      const r = await saveConversionsAction(
        client,
        rows.map((row) => ({
          kind: row.kind,
          key: row.key,
          label: row.label,
          pagePath: row.kind === "form" && row.pagePath.trim() ? row.pagePath : null,
        })),
      );
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          Sin conversiones. Agrega al menos una para que Funnels y Leads muestren datos.
        </p>
      )}

      {rows.map((row, i) => (
        <div
          key={row.uid}
          className="grid gap-3 rounded-lg border border-border/70 bg-background/40 p-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <Select value={row.kind} onValueChange={(v) => v && update(row.uid, { kind: v as Kind })}>
            <SelectTrigger className="w-full" aria-label="Tipo">
              <SelectValue>{(value: string | null) => KIND_LABEL[(value as Kind) ?? "event"]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="event">{KIND_LABEL.event}</SelectItem>
              <SelectItem value="form">{KIND_LABEL.form}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            aria-label="Nombre"
            placeholder={row.kind === "event" ? "WhatsApp" : "Formulario de contacto"}
            value={row.label}
            onChange={(e) => update(row.uid, { label: e.target.value })}
          />
          <Input
            aria-label={row.kind === "event" ? "Nombre del evento" : "Fuente del lead"}
            placeholder={row.kind === "event" ? "whatsapp_click" : "form_submitted"}
            className="font-mono text-xs"
            value={row.key}
            onChange={(e) => update(row.uid, { key: e.target.value, keyTouched: true })}
          />
          {row.kind === "form" ? (
            <Input
              aria-label="Página del formulario"
              placeholder="/contacto"
              className="font-mono text-xs"
              value={row.pagePath}
              onChange={(e) => update(row.uid, { pagePath: e.target.value })}
            />
          ) : (
            <span className="flex items-center text-xs text-muted-foreground">
              Embudo: screen_view → evento
            </span>
          )}
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Subir"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Bajar"
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Quitar"
              onClick={() => setRows((current) => current.filter((r) => r.uid !== row.uid))}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      ))}

      <p className="text-xs leading-relaxed text-muted-foreground">
        <strong className="font-medium text-foreground">Evento:</strong> el nombre exacto del evento
        que el sitio manda a OpenPanel (p. ej. <code>whatsapp_click</code>); cuenta personas únicas.{" "}
        <strong className="font-medium text-foreground">Formulario:</strong> la fuente que el
        snippet de GTM envía al webhook (p. ej. <code>form_submitted</code>) y la página donde vive
        el formulario; guarda nombre, correo y teléfono. Quitar un formulario no borra sus leads.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => add("event")}>
          <MousePointerClickIcon />
          <PlusIcon className="-ml-1 size-3" />
          Evento
        </Button>
        <Button type="button" variant="outline" onClick={() => add("form")}>
          <SquarePenIcon />
          <PlusIcon className="-ml-1 size-3" />
          Formulario
        </Button>
        <Button type="button" disabled={saving} onClick={save}>
          {saving && <Loader2Icon className="animate-spin" />}
          Guardar conversiones
        </Button>
      </div>
      {result && (
        <p className={result.ok ? "text-xs text-status-good" : "text-xs text-status-critical"}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </div>
  );
}

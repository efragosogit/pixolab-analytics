"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { createDashboardAction } from "@/app/(dashboard)/nuevo/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/settings-forms";

/** Same rule as lib/client-settings.ts's suggestSlug — duplicated here because that file is server-only. */
function suggestSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function NewDashboardForm() {
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [site, setSite] = useState("");
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          // Only returns on failure — success redirects into the wizard.
          const result = await createDashboardAction({ displayName, slug, site });
          setError({ message: result.error, field: result.field });
        });
      }}
    >
      <Field label="Nombre del cliente">
        <Input
          autoFocus
          required
          value={displayName}
          placeholder="Lumiservicios"
          aria-invalid={error?.field === "displayName" || undefined}
          onChange={(e) => {
            setDisplayName(e.target.value);
            if (!slugTouched) setSlug(suggestSlug(e.target.value));
          }}
        />
      </Field>
      <Field
        label="Dirección del dashboard"
        hint="Minúsculas, números y guiones. No se puede cambiar después."
      >
        <div className="flex items-center rounded-lg border border-input bg-transparent pl-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            analytics.pixolab.com.mx/
          </span>
          <input
            required
            value={slug}
            placeholder="cliente"
            aria-invalid={error?.field === "slug" || undefined}
            className="h-8 min-w-0 flex-1 bg-transparent pr-3 font-mono text-xs text-foreground outline-none"
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setSlugTouched(true);
            }}
          />
        </div>
      </Field>
      <Field
        label="Sitio web"
        hint="Para obtener su ícono y permitir que el sitio envíe leads. Opcional por ahora."
      >
        <Input
          value={site}
          placeholder="https://cliente.com"
          aria-invalid={error?.field === "site" || undefined}
          onChange={(e) => setSite(e.target.value)}
        />
      </Field>

      {error && <p className="text-sm text-status-critical">{error.message}</p>}

      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Crear y continuar
      </Button>
    </form>
  );
}

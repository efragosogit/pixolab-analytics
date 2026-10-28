"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { canManageAccess } from "@/lib/auth/users";
import {
  createDraftClient,
  normalizeOrigin,
  saveIntegration,
  slugExists,
  validateSlug,
} from "@/lib/client-settings";
import { fetchFaviconDataUrl } from "@/lib/favicon";

export interface CreateDashboardResult {
  ok: false;
  error: string;
  field?: "displayName" | "slug" | "site";
}

const schema = z.object({
  displayName: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(80),
  slug: z.string().trim().toLowerCase(),
  site: z.string().trim().max(200),
});

/**
 * Step 1 of the new-dashboard wizard: creates the `clients` row as a draft
 * (staff-only until published), fetches its favicon from the site, and
 * generates its own leads ingest secret so the GTM snippet is ready on the
 * Leads step. Then hands off to the Configuración page in wizard mode for
 * every other step. On success it redirects and never returns.
 */
export async function createDashboardAction(input: {
  displayName: string;
  slug: string;
  site: string;
}): Promise<CreateDashboardResult> {
  // Outside any try/catch — requireUser() and redirect() both throw
  // Next.js control-flow signals that must not be swallowed.
  const user = await requireUser();
  if (!canManageAccess(user.email)) {
    return { ok: false, error: "Solo el equipo de Pixolab puede crear dashboards." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos.", field: "displayName" };
  }
  const { displayName, slug, site } = parsed.data;

  const slugError = validateSlug(slug);
  if (slugError) return { ok: false, error: slugError, field: "slug" };

  const origin = site ? normalizeOrigin(site) : null;
  if (site && !origin) {
    return { ok: false, error: "El sitio web no es una dirección válida (p. ej. https://cliente.com).", field: "site" };
  }

  try {
    if (await slugExists(slug)) {
      return { ok: false, error: `Ya existe un dashboard con la dirección /${slug}.`, field: "slug" };
    }
    await createDraftClient({
      slug,
      displayName,
      allowedOrigin: origin,
      faviconPath: origin ? await fetchFaviconDataUrl(origin) : null,
      createdBy: user.email,
    });
    await saveIntegration(slug, "leads", {
      config: {},
      secrets: { ingestSecret: randomBytes(24).toString("hex") },
      updatedBy: user.email,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  redirect(`/${slug}/configuracion?asistente=1&paso=openpanel`);
}

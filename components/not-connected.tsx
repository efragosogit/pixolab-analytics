import Link from "next/link";
import { PlugIcon, SettingsIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageAccess } from "@/lib/auth/users";
import type { IntegrationKind } from "@/lib/client-settings";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const INTEGRATION_NAME: Record<IntegrationKind | "conversions", string> = {
  openpanel: "OpenPanel",
  gsc: "Search Console",
  google_ads: "Google Ads",
  leads: "la fuente de leads",
  conversions: "las conversiones",
};

/**
 * What a page renders instead of its data when the integration it reads
 * from isn't connected for this client yet — every integration is optional
 * since 2026-10-28 (see lib/client-config.ts), so a dashboard without, say,
 * Google Ads shows this on the Ads page instead of an error. Staff
 * (@pixolab.com.mx, the only ones who can open Configuración) also get a
 * direct link to the right section; everyone else just sees the state.
 */
export async function NotConnected({
  client,
  integration,
}: {
  client: string;
  integration: IntegrationKind | "conversions";
}) {
  const user = await getCurrentUser();
  const canConfigure = user ? canManageAccess(user.email) : false;
  const name = INTEGRATION_NAME[integration];

  return (
    <Card className="border-dashed border-border bg-card/40 py-10">
      <CardContent className="flex flex-col items-center gap-3 px-5 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <PlugIcon className="size-4 text-muted-foreground" strokeWidth={2.25} />
        </span>
        <div>
          <p className="font-medium text-foreground">
            {integration === "conversions"
              ? "Sin conversiones configuradas"
              : `${name[0]!.toUpperCase()}${name.slice(1)} no está conectado`}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {canConfigure
              ? `Conecta ${name} desde la configuración de este dashboard para ver estos datos.`
              : `Esta sección aún no tiene datos para este dashboard. El equipo de Pixolab la conectará pronto.`}
          </p>
        </div>
        {canConfigure && (
          <Link
            href={`/${client}/configuracion#${integration}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <SettingsIcon />
            Ir a Configuración
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

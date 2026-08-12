"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { FileDownIcon, LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Keyed by the path *below* the `/{client}` segment — see `stripClientPrefix`.
const PAGE_TITLES: Record<string, string> = {
  "/": "Trafico-general",
  "/performance": "Performance",
  "/leads": "Leads",
  "/conversiones": "Conversiones",
  "/seo": "SEO",
  "/ads": "Publicidad",
  "/social": "Social-media",
};

/** "/lumiservicios/performance" -> "/performance" — strip the client segment before the PAGE_TITLES lookup, or every page silently falls through to "Reporte". */
function stripClientPrefix(pathname: string, client: string): string {
  const prefix = `/${client}`;
  if (pathname === prefix) return "/";
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
}

export function ExportPdfButton({
  client,
  clientDisplayName,
}: {
  client: string;
  clientDisplayName: string;
}) {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const target = document.getElementById("dashboard-report");
      if (!target) return;

      const isDark = document.documentElement.classList.contains("dark");
      const bg: [number, number, number] = isDark ? [13, 13, 13] : [249, 249, 247];
      const ink: [number, number, number] = isDark ? [255, 255, 255] : [11, 11, 11];
      const subtleInk: [number, number, number] = isDark
        ? [163, 162, 155]
        : [107, 106, 99];

      const canvas = await html2canvas(target, {
        backgroundColor: `rgb(${bg.join(",")})`,
        scale: 2,
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height + 140],
      });

      pdf.setFillColor(...bg);
      pdf.rect(0, 0, canvas.width, canvas.height + 140, "F");

      pdf.setTextColor(...ink);
      pdf.setFontSize(28);
      pdf.text(clientDisplayName, 40, 55);

      pdf.setTextColor(...subtleInk);
      pdf.setFontSize(13);
      const title = PAGE_TITLES[stripClientPrefix(pathname, client)] ?? "Reporte";
      pdf.text(
        `${title.replace(/-/g, " ")} · Generado ${new Date().toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}`,
        40,
        80,
      );

      pdf.addImage(imgData, "PNG", 0, 120, canvas.width, canvas.height);

      const filename = `${client}-${title}-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={busy}
      className="h-9 gap-2 border-border/70 bg-card/60 font-normal hover:bg-accent hover:text-foreground"
    >
      {busy ? (
        <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" />
      ) : (
        <FileDownIcon className="size-3.5 text-muted-foreground" />
      )}
      <span className="hidden text-sm sm:inline">
        {busy ? "Generando…" : "Exportar PDF"}
      </span>
    </Button>
  );
}

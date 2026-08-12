import type { QualityRating } from "./leads-db";

/**
 * Shape used by the Leads page's UI (table + qualification modal) —
 * separate from `lib/mock-data.ts`'s `Lead` (the simulated generator,
 * kept only for reference, no longer used by any page) since this one
 * carries qualification fields the mock never needed.
 */
export interface LeadDisplay {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: "Formulario de contacto" | "Descarga de catálogo";
  page: string;
  date: string; // full ISO timestamp
  detail: string;
  qualityRating: QualityRating | null;
  qualifierNotes: string | null;
  qualifiedBy: string | null;
  qualifiedAt: string | null; // full ISO timestamp
}

export type { QualityRating };

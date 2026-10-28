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
  /** Display label of the lead's form conversion (see client_conversions). */
  source: string;
  /** The raw `leads.source` value — what the source filter tabs match on. */
  sourceKey: string;
  /** CSS color for the source badge, same order as the Funnels chart series. */
  sourceColor: string;
  page: string;
  date: string; // full ISO timestamp
  detail: string;
  qualityRating: QualityRating | null;
  qualifierNotes: string | null;
  qualifiedBy: string | null;
  qualifiedAt: string | null; // full ISO timestamp
}

export type { QualityRating };

"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { updateLeadQualification, type QualityRating } from "@/lib/leads-db";

export interface SaveQualificationResult {
  ok: boolean;
  error?: string;
}

export async function saveLeadQualification(
  client: string,
  leadId: string,
  rating: QualityRating | null,
  notes: string,
  qualifiedBy: string,
): Promise<SaveQualificationResult> {
  // Outside the try/catch below on purpose — requireUser() may call
  // redirect(), which throws a special Next.js signal a catch-all here
  // would otherwise swallow and turn into an error response instead of an
  // actual redirect.
  await requireUser();

  try {
    await updateLeadQualification(client, {
      leadId,
      rating,
      notes: notes.trim() || null,
      qualifiedBy: qualifiedBy.trim() || null,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/${client}/leads`);
  return { ok: true };
}

import { createServiceClient } from "@/supabase";
import { bibleSourcedEkegusiiSeed } from "@/ekegusii-language-audit";

export type EkegusiiCorrection = {
  id: string;
  pathway_slug: string;
  step_index: number;
  scripture_reference: string;
  reviewer_name: string;
  reviewer_email: string;
  reviewer_location: string;
  reviewer_notes: string;
  proposed_title: string;
  proposed_explanation: string;
  proposed_hook: string;
  edited_title: string | null;
  edited_explanation: string | null;
  edited_hook: string | null;
  status: "submitted" | "in_review" | "approved" | "rejected" | "published";
  admin_notes: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  inbox_conversation_id: string | null;
};

export async function listEkegusiiCorrections() {
  const service = createServiceClient();
  if (!service) return { rows: [] as EkegusiiCorrection[], error: "Supabase is not configured." };
  const { data, error } = await service.from("ekegusii_corrections").select("*").order("created_at", { ascending: false }).limit(300);
  return { rows: (data ?? []) as EkegusiiCorrection[], error: error?.message ?? null };
}

export async function getEkegusiiCorrection(id: string) {
  const service = createServiceClient();
  if (!service) return null;
  const { data, error } = await service.from("ekegusii_corrections").select("*").eq("id", id).maybeSingle();
  if (error) throw Error(error.message);
  return data as EkegusiiCorrection | null;
}

/** Only approved, published teaching fields are read; no reviewer details leak to public pages. */
export async function getPublishedEkegusiiSeed(slug: string) {
  const baseline = bibleSourcedEkegusiiSeed(slug);
  const service = createServiceClient();
  if (!service) return baseline;
  const { data, error } = await service.from("ekegusii_published_steps")
    .select("step_index,title,explanation,hook").eq("pathway_slug", slug);
  if (error) {
    console.error("Unable to load published Ekegusii revisions", error.code);
    return baseline;
  }
  const steps = { ...(baseline.steps ?? {}) };
  for (const row of data ?? []) {
    if (!steps[String(row.step_index)]) continue;
    steps[String(row.step_index)] = { title: row.title, explanation: row.explanation, hook: row.hook };
  }
  return { ...baseline, steps };
}

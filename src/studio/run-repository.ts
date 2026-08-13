import { createServiceClient } from "@/supabase";
import { StudioPersistenceError } from "./repository";

function db() {
  const client = createServiceClient();
  if (!client) throw new StudioPersistenceError("AG Studio persistence is not configured. Add the Supabase service credentials first.");
  return client;
}

export type RunCueRow = {
  id: string;
  run_id: string;
  position: number;
  label: string;
  asset_id?: string | null;
  presenter_notes?: string | null;
  enabled: boolean;
  studio_cue_actions?: Array<{ id: string; cue_id: string; position: number; action_type: string; payload: Record<string, unknown> }>;
  studio_assets?: { id: string; asset_type: string; label?: string | null; snapshot_data?: Record<string, unknown> | null; custom_data?: Record<string, unknown> | null } | null;
};

export async function getRunCues(runId: string) {
  const { data, error } = await db()
    .from("studio_cues")
    .select("*, studio_cue_actions(*), studio_assets(id, asset_type, label, snapshot_data, custom_data)")
    .eq("run_id", runId)
    .order("position");
  if (error) throw new StudioPersistenceError(error.message);
  return (data ?? []) as RunCueRow[];
}

export async function getCueForSession(sessionId: string, cueId: string) {
  const client = db();
  const { data: session, error: sessionError } = await client.from("studio_sessions").select("active_run_id").eq("id", sessionId).maybeSingle();
  if (sessionError) throw new StudioPersistenceError(sessionError.message);
  if (!session) return null;
  const { data, error } = await client
    .from("studio_cues")
    .select("*, studio_cue_actions(*), studio_assets(id, asset_type, label, snapshot_data, custom_data)")
    .eq("id", cueId)
    .eq("run_id", session.active_run_id)
    .maybeSingle();
  if (error) throw new StudioPersistenceError(error.message);
  return data as RunCueRow | null;
}

export async function updateCueNotes(cueId: string, presenterNotes: string) {
  const { data, error } = await db().from("studio_cues").update({ presenter_notes: presenterNotes }).eq("id", cueId).select("*").single();
  if (error) throw new StudioPersistenceError(error.message);
  return data;
}

export async function reorderRunCues(runId: string, cueIds: string[]) {
  const client = db();
  const { data: existing, error } = await client.from("studio_cues").select("id").eq("run_id", runId);
  if (error) throw new StudioPersistenceError(error.message);
  const existingIds = new Set((existing ?? []).map((item) => item.id));
  if (cueIds.length !== existingIds.size || cueIds.some((id) => !existingIds.has(id))) {
    throw new StudioPersistenceError("Cue order must contain every cue in this run exactly once.");
  }

  for (let index = 0; index < cueIds.length; index += 1) {
    const { error: tempError } = await client.from("studio_cues").update({ position: 10000 + index }).eq("id", cueIds[index]).eq("run_id", runId);
    if (tempError) throw new StudioPersistenceError(tempError.message);
  }
  for (let index = 0; index < cueIds.length; index += 1) {
    const { error: finalError } = await client.from("studio_cues").update({ position: index }).eq("id", cueIds[index]).eq("run_id", runId);
    if (finalError) throw new StudioPersistenceError(finalError.message);
  }
  return getRunCues(runId);
}

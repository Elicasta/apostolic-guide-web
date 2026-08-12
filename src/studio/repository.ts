import { createServiceClient } from "@/supabase";
import type { StudioAccessMode, StudioEpisodeType, StudioProgramState } from "./types";

export class StudioPersistenceError extends Error {}

function db() {
  const client = createServiceClient();
  if (!client) throw new StudioPersistenceError("AG Studio persistence is not configured. Add the Supabase service credentials first.");
  return client;
}

export function studioSlug(title: string) {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "episode";
  return `${base}-${Date.now().toString(36)}`;
}

export async function listEpisodes() {
  const { data, error } = await db().from("studio_episodes").select("*").neq("status", "archived").order("updated_at", { ascending: false });
  if (error) throw new StudioPersistenceError(error.message);
  return data ?? [];
}

export async function getEpisode(episodeId: string) {
  const client = db();
  const [{ data: episode, error }, { data: pathways }, { data: runs }] = await Promise.all([
    client.from("studio_episodes").select("*").eq("id", episodeId).maybeSingle(),
    client.from("studio_episode_pathways").select("*").eq("episode_id", episodeId).order("sort_order"),
    client.from("studio_runs").select("*").eq("episode_id", episodeId).order("version", { ascending: false })
  ]);
  if (error) throw new StudioPersistenceError(error.message);
  if (!episode) return null;
  const run = (runs ?? []).find((item) => item.is_active) ?? runs?.[0] ?? null;
  let cues: unknown[] = [];
  if (run) {
    const { data, error: cueError } = await client.from("studio_cues").select("*, studio_cue_actions(*)").eq("run_id", run.id).order("position");
    if (cueError) throw new StudioPersistenceError(cueError.message);
    cues = data ?? [];
  }
  return { episode, pathways: pathways ?? [], run, cues };
}

export async function createEpisode(input: { title: string; type?: StudioEpisodeType; accessMode?: StudioAccessMode; pathwayId?: string; createdBy: string }) {
  const client = db();
  const { data: episode, error } = await client.from("studio_episodes").insert({
    title: input.title.trim(),
    slug: studioSlug(input.title),
    episode_type: input.type ?? "solo",
    access_mode: input.accessMode ?? "public",
    created_by: input.createdBy
  }).select("*").single();
  if (error) throw new StudioPersistenceError(error.message);

  if (input.pathwayId) {
    const { error: pathwayError } = await client.from("studio_episode_pathways").insert({ episode_id: episode.id, pathway_id: input.pathwayId, is_primary: true, sort_order: 0 });
    if (pathwayError) throw new StudioPersistenceError(pathwayError.message);
  }

  const { data: run, error: runError } = await client.from("studio_runs").insert({ episode_id: episode.id, name: "Main Run", version: 1, is_active: true }).select("*").single();
  if (runError) throw new StudioPersistenceError(runError.message);
  return { episode, run };
}

export async function addPathwayScriptureCue(input: { episodeId: string; runId: string; pathwayId: string; reference: string; title: string; explanation: string; position: number }) {
  const client = db();
  const { data: asset, error: assetError } = await client.from("studio_assets").insert({
    episode_id: input.episodeId,
    asset_type: "scripture",
    source_type: "pathway_step",
    source_id: `${input.pathwayId}:${input.reference}`,
    label: input.reference,
    snapshot_data: { pathwayId: input.pathwayId, reference: input.reference, title: input.title, explanation: input.explanation }
  }).select("*").single();
  if (assetError) throw new StudioPersistenceError(assetError.message);

  const { data: cue, error: cueError } = await client.from("studio_cues").insert({ run_id: input.runId, position: input.position, label: input.reference, asset_id: asset.id }).select("*").single();
  if (cueError) throw new StudioPersistenceError(cueError.message);

  const { error: actionError } = await client.from("studio_cue_actions").insert([
    { cue_id: cue.id, position: 0, action_type: "scripture.load", payload: { assetId: asset.id } },
    { cue_id: cue.id, position: 1, action_type: "scene.set", payload: { sceneId: "host-scripture" } }
  ]);
  if (actionError) throw new StudioPersistenceError(actionError.message);
  return { asset, cue };
}

export async function createSession(input: { episodeId: string; runId: string }) {
  const client = db();
  const { data: session, error } = await client.from("studio_sessions").insert({ episode_id: input.episodeId, active_run_id: input.runId, status: "created" }).select("*").single();
  if (error) throw new StudioPersistenceError(error.message);
  const initial: StudioProgramState = {
    sessionId: session.id,
    episodeId: input.episodeId,
    status: "prepared",
    currentSceneId: "host-full",
    activeOverlays: [],
    sourceStates: {},
    version: 0,
    updatedAt: new Date().toISOString()
  };
  const { error: stateError } = await client.from("studio_session_state").insert({ session_id: session.id, state: initial, state_version: 0 });
  if (stateError) throw new StudioPersistenceError(stateError.message);
  return { session, state: initial };
}

export async function getSession(sessionId: string) {
  const client = db();
  const { data: session, error } = await client.from("studio_sessions").select("*, studio_episodes(title, slug)").eq("id", sessionId).maybeSingle();
  if (error) throw new StudioPersistenceError(error.message);
  if (!session) return null;
  const { data: row, error: stateError } = await client.from("studio_session_state").select("state, state_version, updated_at").eq("session_id", sessionId).maybeSingle();
  if (stateError) throw new StudioPersistenceError(stateError.message);
  return { session, state: (row?.state ?? null) as StudioProgramState | null, stateVersion: Number(row?.state_version ?? 0) };
}

export async function saveSessionState(sessionId: string, state: StudioProgramState, expectedVersion: number) {
  const client = db();
  const nextVersion = expectedVersion + 1;
  const nextState: StudioProgramState = { ...state, sessionId, version: nextVersion, updatedAt: new Date().toISOString() };
  const { data, error } = await client.from("studio_session_state").update({ state: nextState, state_version: nextVersion }).eq("session_id", sessionId).eq("state_version", expectedVersion).select("state_version").maybeSingle();
  if (error) throw new StudioPersistenceError(error.message);
  if (!data) throw new StudioPersistenceError("Studio state changed on another controller. Refresh the authoritative state before retrying.");
  return nextState;
}

export async function getAppliedActionIds(sessionId: string) {
  const { data, error } = await db().from("studio_production_events").select("action_id").eq("session_id", sessionId).eq("success", true).not("action_id", "is", null);
  if (error) throw new StudioPersistenceError(error.message);
  return new Set((data ?? []).map((item) => item.action_id).filter((value): value is string => typeof value === "string"));
}

export async function logProductionEvent(input: { sessionId: string; actorId?: string; eventType: string; cueId?: string; actionId?: string; payload?: Record<string, unknown>; success?: boolean; error?: string }) {
  const { error } = await db().from("studio_production_events").insert({
    session_id: input.sessionId,
    actor_id: input.actorId,
    event_type: input.eventType,
    cue_id: input.cueId,
    action_id: input.actionId,
    payload: input.payload ?? {},
    success: input.success ?? true,
    error: input.error
  });
  if (error) throw new StudioPersistenceError(error.message);
}

import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import type { SongDraft, SongEvaluation, SongProject, SongStyleProfile } from "./types";

export async function requireSongStudioAccess() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) {
    return { ok: false as const, access, user: null, service: null };
  }
  const service = createServiceClient();
  if (!service) return { ok: false as const, access, user: access.user, service: null };
  return { ok: true as const, access, user: access.user, service };
}

export async function listSongProjects() {
  const service = createServiceClient();
  if (!service) return [] as SongProject[];
  const { data, error } = await service.from("song_projects").select("*").order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SongProject[];
}

export async function listSongStyles() {
  const service = createServiceClient();
  if (!service) return [] as SongStyleProfile[];
  const { data, error } = await service.from("song_style_profiles").select("*").order("is_system", { ascending: false }).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as SongStyleProfile[];
}

export async function listSongDrafts(projectId: string) {
  const service = createServiceClient();
  if (!service) return [] as SongDraft[];
  const { data, error } = await service.from("song_drafts").select("*").eq("project_id", projectId).order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SongDraft[];
}

export async function latestEvaluationForDraft(draftId: string) {
  const service = createServiceClient();
  if (!service) return null as SongEvaluation | null;
  const { data, error } = await service.from("song_evaluations").select("*").eq("draft_id", draftId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data as SongEvaluation | null;
}

export async function getSongStudioBootstrap() {
  const service = createServiceClient();
  if (!service) return { projects: [] as SongProject[], styles: [] as SongStyleProfile[] };
  const [projectsResult, stylesResult] = await Promise.all([
    service.from("song_projects").select("*").order("updated_at", { ascending: false }),
    service.from("song_style_profiles").select("*").order("is_system", { ascending: false }).order("name")
  ]);
  if (projectsResult.error) throw new Error(projectsResult.error.message);
  if (stylesResult.error) throw new Error(stylesResult.error.message);

  const projects = (projectsResult.data ?? []) as SongProject[];
  const currentDraftIds = projects.map((project) => project.current_draft_id).filter((id): id is string => Boolean(id));
  if (!currentDraftIds.length) return { projects, styles: (stylesResult.data ?? []) as SongStyleProfile[] };

  const draftsResult = await service.from("song_drafts").select("*").in("id", currentDraftIds);
  if (draftsResult.error) throw new Error(draftsResult.error.message);
  const drafts = (draftsResult.data ?? []) as SongDraft[];
  const draftMap = new Map(drafts.map((draft) => [draft.id, draft]));

  const evalResult = await service.from("song_evaluations").select("*").in("draft_id", currentDraftIds).order("created_at", { ascending: false });
  if (evalResult.error) throw new Error(evalResult.error.message);
  const evalMap = new Map<string, SongEvaluation>();
  for (const evaluation of (evalResult.data ?? []) as SongEvaluation[]) {
    const draftId = evaluation.draft_id;
    if (draftId && !evalMap.has(draftId)) evalMap.set(draftId, evaluation);
  }

  for (const project of projects) {
    if (!project.current_draft_id) continue;
    const draft = draftMap.get(project.current_draft_id);
    if (draft) {
      draft.evaluation = evalMap.get(draft.id) ?? null;
      project.current_draft = draft;
    }
  }

  return { projects, styles: (stylesResult.data ?? []) as SongStyleProfile[] };
}

export async function insertSongDraft({
  projectId,
  title,
  lyrics,
  notes,
  source,
  aiModel = null,
  aiResponseId = null,
  aiUsage = {},
  userId
}: {
  projectId: string;
  title: string;
  lyrics: string;
  notes?: string;
  source: "human" | "ai" | "hybrid";
  aiModel?: string | null;
  aiResponseId?: string | null;
  aiUsage?: Record<string, unknown>;
  userId: string;
}) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const latest = await service.from("song_drafts").select("version").eq("project_id", projectId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw new Error(latest.error.message);
    const version = Number(latest.data?.version ?? 0) + 1;
    const created = await service.from("song_drafts").insert({
      project_id: projectId,
      version,
      title,
      lyrics,
      notes: notes ?? "",
      source,
      ai_model: aiModel,
      ai_response_id: aiResponseId,
      ai_usage: aiUsage,
      created_by: userId
    }).select("*").single();

    if (!created.error) {
      const draft = created.data as SongDraft;
      const updated = await service.from("song_projects").update({
        current_draft_id: draft.id,
        title: title || "Untitled Song",
        working_title: title || "Untitled Song",
        status: "writing",
        updated_at: new Date().toISOString()
      }).eq("id", projectId);
      if (updated.error) throw new Error(updated.error.message);
      return draft;
    }

    if (created.error.code !== "23505" || attempt === 1) throw new Error(created.error.message);
  }

  throw new Error("Could not allocate a draft version.");
}

export async function recordSongGeneration(input: {
  projectId: string;
  draftId?: string | null;
  generationType: "write" | "refine" | "evaluate" | "suno_prompt";
  model: string;
  promptVersion: string;
  inputSnapshot: Record<string, unknown>;
  outputSnapshot: Record<string, unknown>;
  responseId?: string | null;
  usage?: Record<string, unknown>;
  userId: string;
}) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const result = await service.from("song_generations").insert({
    project_id: input.projectId,
    draft_id: input.draftId ?? null,
    generation_type: input.generationType,
    model: input.model,
    prompt_version: input.promptVersion,
    input_snapshot: input.inputSnapshot,
    output_snapshot: input.outputSnapshot,
    response_id: input.responseId ?? null,
    usage: input.usage ?? {},
    created_by: input.userId
  });
  if (result.error) throw new Error(result.error.message);
}

import "server-only";
import { pathwayBySlug } from "./pathway-catalog";
import {
  buildCreativeSearchText,
  collectScriptureReferences,
  normalizeEditorState,
  type CreativeFormat,
  type CreativeIntent,
  type CreativeProjectSnapshot,
  type CreativeStatus
} from "./creative-project";
import { createServiceClient } from "./supabase";

export type CreativeProjectRecord = {
  id: string;
  title: string;
  pathwaySlug: string;
  pathwayCollection: string;
  pathwayTitle: string;
  intent: CreativeIntent;
  format: CreativeFormat;
  destination: string;
  frameCount: number;
  status: CreativeStatus;
  editorState: ReturnType<typeof normalizeEditorState>;
  unifiedCaption: string;
  cta: string;
  scriptureReferences: string[];
  tags: string[];
  stateVersion: number;
  lastAutosavedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Service = NonNullable<ReturnType<typeof createServiceClient>>;

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

export function creativeProjectFromRow(row: Record<string, unknown>): CreativeProjectRecord {
  const format = String(row.format) as CreativeFormat;
  const pathwaySlug = String(row.pathway_slug || "");
  const pathway = pathwayBySlug(pathwaySlug);
  const editorState = normalizeEditorState(format, row.editor_state);
  return {
    id: String(row.id),
    title: String(row.title || "Untitled Creative"),
    pathwaySlug,
    pathwayCollection: String(row.pathway_collection || pathway?.collection || ""),
    pathwayTitle: pathway?.title || pathwaySlug,
    intent: String(row.intent) as CreativeIntent,
    format,
    destination: String(row.destination || "instagram"),
    frameCount: editorState.frames.length,
    status: String(row.status) as CreativeStatus,
    editorState,
    unifiedCaption: String(row.unified_caption || ""),
    cta: String(row.cta || ""),
    scriptureReferences: stringArray(row.scripture_references),
    tags: stringArray(row.tags),
    stateVersion: Number(row.state_version || 1),
    lastAutosavedAt: typeof row.last_autosaved_at === "string" ? row.last_autosaved_at : null,
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || "")
  };
}

export function creativeProjectSnapshot(project: CreativeProjectRecord): CreativeProjectSnapshot {
  return {
    title: project.title,
    pathwaySlug: project.pathwaySlug,
    pathwayCollection: project.pathwayCollection,
    intent: project.intent,
    format: project.format,
    destination: project.destination,
    status: project.status,
    editorState: project.editorState,
    unifiedCaption: project.unifiedCaption,
    cta: project.cta,
    scriptureReferences: project.scriptureReferences,
    tags: project.tags
  };
}

export async function loadCreativeProject(service: Service, id: string) {
  const result = await service.from("studio_creative_projects").select("*").eq("id", id).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? creativeProjectFromRow(result.data as Record<string, unknown>) : null;
}

export async function createCreativeCheckpoint(service: Service, project: CreativeProjectRecord, userId: string, input?: {
  reason?: "checkpoint" | "restore" | "generation" | "structure_change" | "duplicate_source";
  changeSummary?: string | null;
  restoredFromRevisionId?: string | null;
}) {
  const latest = await service.from("studio_creative_project_revisions")
    .select("version")
    .eq("project_id", project.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new Error(latest.error.message);
  const version = Number(latest.data?.version || 0) + 1;
  const saved = await service.from("studio_creative_project_revisions").insert({
    project_id: project.id,
    version,
    reason: input?.reason ?? "checkpoint",
    change_summary: input?.changeSummary?.trim().slice(0, 500) || null,
    snapshot: creativeProjectSnapshot(project),
    restored_from_revision_id: input?.restoredFromRevisionId ?? null,
    created_by: userId
  }).select("id,project_id,version,reason,change_summary,restored_from_revision_id,created_at").single();
  if (saved.error) throw new Error(saved.error.message);
  return saved.data;
}

export function creativeProjectUpdatePayload(input: {
  title: string;
  pathwaySlug: string;
  intent: CreativeIntent;
  format: CreativeFormat;
  destination: string;
  editorState: unknown;
  unifiedCaption: string;
  cta: string;
  tags: string[];
  status?: CreativeStatus;
  pathwayTitle?: string;
}) {
  const pathway = pathwayBySlug(input.pathwaySlug);
  if (!pathway) throw new Error("Pathway not found.");
  const editorState = normalizeEditorState(input.format, input.editorState);
  const scriptureReferences = collectScriptureReferences(editorState.frames);
  return {
    title: input.title.trim().slice(0, 180),
    pathway_slug: pathway.slug,
    pathway_collection: pathway.collection,
    intent: input.intent,
    format: input.format,
    destination: input.destination.trim().slice(0, 80) || "instagram",
    frame_count: editorState.frames.length,
    ...(input.status ? { status: input.status } : {}),
    editor_state: editorState,
    unified_caption: input.unifiedCaption.slice(0, 10000),
    cta: input.cta.slice(0, 2000),
    scripture_references: scriptureReferences,
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 30),
    search_text: buildCreativeSearchText({
      title: input.title,
      pathwayTitle: input.pathwayTitle ?? pathway.title,
      pathwaySlug: pathway.slug,
      intent: input.intent,
      format: input.format,
      frames: editorState.frames,
      unifiedCaption: input.unifiedCaption,
      tags: input.tags
    })
  };
}

export async function getCreativeProductionSnapshot() {
  const service = createServiceClient();
  if (!service) return { configured: false, counts: {}, unscheduledReady: [], recentFailed: [] };
  const [projects, publications] = await Promise.all([
    service.from("studio_creative_projects")
      .select("id,title,pathway_slug,intent,format,frame_count,status,updated_at")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(200),
    service.from("pathway_publications")
      .select("id,creative_project_id,status,scheduled_for,error_message,updated_at")
      .not("creative_project_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(250)
  ]);
  if (projects.error) throw new Error(projects.error.message);
  if (publications.error) throw new Error(publications.error.message);
  const rows = projects.data ?? [];
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const activeProjectIds = new Set((publications.data ?? [])
    .filter((row) => ["scheduled", "publishing", "published", "needs_manual_finish"].includes(row.status))
    .map((row) => row.creative_project_id)
    .filter(Boolean));
  return {
    configured: true,
    counts,
    unscheduledReady: rows
      .filter((row) => row.status === "ready" && !activeProjectIds.has(row.id))
      .slice(0, 12)
      .map((row) => ({ id: row.id, title: row.title, pathwaySlug: row.pathway_slug, intent: row.intent, format: row.format, frameCount: row.frame_count, updatedAt: row.updated_at })),
    recentFailed: (publications.data ?? [])
      .filter((row) => row.status === "failed")
      .slice(0, 10)
      .map((row) => ({ publicationId: row.id, projectId: row.creative_project_id, error: row.error_message, updatedAt: row.updated_at }))
  };
}

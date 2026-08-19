import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { ApostolicMotionPilot } from "@/apostolic-motion-pilot";
import { allPathways } from "@/pathway-catalog";
import { PathwayVideoStudio } from "@/pathway-video-studio";
import { VideoStudioWorkflow } from "@/video-studio-workflow";
import type { PathwayVideoCue, PathwayVideoCueKind, PathwayVideoFormat } from "@/pathway-video";
import { createServiceClient } from "@/supabase";

type AudioAssetRow = {
  pathway_slug: string;
  audio_url: string;
  content_hash: string;
  generated_at: string;
};

type ScriptRow = {
  pathway_slug: string;
  status: "draft" | "approved";
};

type ProjectRow = {
  id: string;
  pathway_slug: string;
  audio_content_hash: string | null;
  timeline: unknown;
  style: unknown;
  updated_at: string;
};

type RawRenderRow = {
  id: string;
  pathway_slug: string;
  format: PathwayVideoFormat;
  status: "queued" | "rendering" | "completed" | "failed";
  output_url: string | null;
  error: string | null;
  requested_at: string;
  completed_at: string | null;
  config_snapshot: unknown;
};

type RenderRow = Omit<RawRenderRow, "config_snapshot"> & {
  progress_percent: number;
  progress_stage: string;
  progress_heartbeat_at: string | null;
};

const CUE_KINDS = new Set<PathwayVideoCueKind>(["question", "brand", "scripture", "statement", "recap", "cta"]);

function parseTimeline(value: unknown): PathwayVideoCue[] | null {
  if (!Array.isArray(value)) return null;
  const cues = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const cue = item as Record<string, unknown>;
    if (typeof cue.id !== "string" || typeof cue.start !== "number" || typeof cue.title !== "string") return [];
    const kind = typeof cue.kind === "string" && CUE_KINDS.has(cue.kind as PathwayVideoCueKind)
      ? cue.kind as PathwayVideoCueKind
      : "scripture";
    return [{
      id: cue.id,
      start: cue.start,
      kind,
      eyebrow: typeof cue.eyebrow === "string" ? cue.eyebrow : "",
      title: cue.title,
      body: typeof cue.body === "string" ? cue.body : "",
      reference: typeof cue.reference === "string" ? cue.reference : ""
    } satisfies PathwayVideoCue];
  });
  return cues.length ? cues : null;
}

function renderProgress(row: RawRenderRow): RenderRow {
  const snapshot = row.config_snapshot && typeof row.config_snapshot === "object" ? row.config_snapshot as Record<string, unknown> : {};
  const raw = snapshot.rendererProgress && typeof snapshot.rendererProgress === "object" ? snapshot.rendererProgress as Record<string, unknown> : {};
  const fallbackPercent = row.status === "completed" ? 100 : row.status === "rendering" ? 7 : row.status === "queued" ? 1 : 0;
  const fallbackStage = row.status === "completed" ? "Ready" : row.status === "rendering" ? "Rendering video" : row.status === "queued" ? "Queued" : "Failed";
  return {
    id: row.id,
    pathway_slug: row.pathway_slug,
    format: row.format,
    status: row.status,
    output_url: row.output_url,
    error: row.error,
    requested_at: row.requested_at,
    completed_at: row.completed_at,
    progress_percent: Math.max(0, Math.min(100, Number(raw.percent ?? fallbackPercent))),
    progress_stage: typeof raw.stage === "string" && raw.stage.trim() ? raw.stage.trim() : fallbackStage,
    progress_heartbeat_at: typeof raw.heartbeatAt === "string" ? raw.heartbeatAt : null
  };
}

export default async function AdminVideoStudioPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  const service = createServiceClient();
  let assetRows: AudioAssetRow[] = [];
  let scriptRows: ScriptRow[] = [];
  let projectRows: ProjectRow[] = [];
  let renderRows: RenderRow[] = [];
  let databaseReady = Boolean(service);
  let rendererReady = Boolean(process.env.VIDEO_STUDIO_GITHUB_TOKEN?.trim());

  if (service) {
    const [assetsResult, scriptsResult, projectsResult, rendersResult, rendererSecretResult] = await Promise.all([
      service.from("pathway_audio_assets").select("pathway_slug,audio_url,content_hash,generated_at"),
      service.from("pathway_audio_scripts").select("pathway_slug,status"),
      service.from("pathway_video_projects").select("id,pathway_slug,audio_content_hash,timeline,style,updated_at"),
      service.from("pathway_video_renders").select("id,pathway_slug,format,status,output_url,error,requested_at,completed_at,config_snapshot").order("requested_at", { ascending: false }).limit(100),
      rendererReady
        ? Promise.resolve({ data: null, error: null })
        : service.schema("analytics").from("integration_secrets").select("name").eq("name", "video_studio_github_token").maybeSingle()
    ]);

    assetRows = (assetsResult.data ?? []) as AudioAssetRow[];
    scriptRows = (scriptsResult.data ?? []) as ScriptRow[];
    projectRows = (projectsResult.data ?? []) as ProjectRow[];
    renderRows = ((rendersResult.data ?? []) as RawRenderRow[]).map(renderProgress);
    databaseReady = !projectsResult.error && !rendersResult.error;
    rendererReady = rendererReady || Boolean(rendererSecretResult.data);

    if (assetsResult.error) console.error("video studio audio asset load failed", assetsResult.error.message);
    if (scriptsResult.error) console.error("video studio script load failed", scriptsResult.error.message);
    if (projectsResult.error) console.error("video studio project load failed", projectsResult.error.message);
    if (rendersResult.error) console.error("video studio render load failed", rendersResult.error.message);
    if (rendererSecretResult.error) console.error("video studio renderer credential load failed", rendererSecretResult.error.message);
  }

  const assets = new Map(assetRows.map((row) => [row.pathway_slug, row]));
  const scripts = new Map(scriptRows.map((row) => [row.pathway_slug, row]));
  const projects = new Map(projectRows.map((row) => [row.pathway_slug, row]));
  const renders = new Map<string, RenderRow[]>();
  for (const render of renderRows) renders.set(render.pathway_slug, [...(renders.get(render.pathway_slug) ?? []), render]);

  const pathways = allPathways.map((pathway) => {
    const asset = assets.get(pathway.slug);
    const project = projects.get(pathway.slug);
    return {
      slug: pathway.slug,
      title: pathway.title,
      summary: pathway.summary,
      estimatedMinutes: pathway.estimatedMinutes,
      steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference, explanation: step.explanation })),
      audioUrl: asset?.audio_url ?? null,
      audioContentHash: asset?.content_hash ?? null,
      audioGeneratedAt: asset?.generated_at ?? null,
      scriptApproved: scripts.get(pathway.slug)?.status === "approved",
      project: project ? {
        id: project.id,
        audioContentHash: project.audio_content_hash,
        timeline: parseTimeline(project.timeline),
        style: project.style && typeof project.style === "object" ? project.style as Record<string, unknown> : {},
        updatedAt: project.updated_at
      } : null,
      renders: renders.get(pathway.slug) ?? []
    };
  });

  const aiReady = Boolean(process.env.OPENAI_API_KEY?.trim());

  return <>
    <ApostolicMotionPilot pathways={pathways} databaseReady={databaseReady} rendererReady={rendererReady}/>
    <PathwayVideoStudio pathways={pathways} databaseReady={databaseReady} rendererReady={rendererReady}/>
    <VideoStudioWorkflow aiReady={aiReady}/>
  </>;
}

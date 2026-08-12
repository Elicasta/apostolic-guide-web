import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { PathwayVideoStudio } from "@/pathway-video-studio";
import type { PathwayVideoCue, PathwayVideoFormat } from "@/pathway-video";
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

type RenderRow = {
  id: string;
  pathway_slug: string;
  format: PathwayVideoFormat;
  status: "queued" | "rendering" | "completed" | "failed";
  output_url: string | null;
  error: string | null;
  requested_at: string;
  completed_at: string | null;
};

function parseTimeline(value: unknown): PathwayVideoCue[] | null {
  if (!Array.isArray(value)) return null;
  const cues = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const cue = item as Record<string, unknown>;
    if (typeof cue.id !== "string" || typeof cue.start !== "number" || typeof cue.title !== "string") return [];
    return [{
      id: cue.id,
      start: cue.start,
      kind: cue.kind === "brand" || cue.kind === "statement" || cue.kind === "cta" ? cue.kind : "scripture",
      eyebrow: typeof cue.eyebrow === "string" ? cue.eyebrow : "",
      title: cue.title,
      body: typeof cue.body === "string" ? cue.body : "",
      reference: typeof cue.reference === "string" ? cue.reference : ""
    } satisfies PathwayVideoCue];
  });
  return cues.length ? cues : null;
}

export default async function AdminVideoStudioPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  const service = createServiceClient();
  let assetRows: AudioAssetRow[] = [];
  let scriptRows: ScriptRow[] = [];
  let projectRows: ProjectRow[] = [];
  let renderRows: RenderRow[] = [];
  let databaseReady = true;

  if (service) {
    const [assetsResult, scriptsResult, projectsResult, rendersResult] = await Promise.all([
      service.from("pathway_audio_assets").select("pathway_slug,audio_url,content_hash,generated_at"),
      service.from("pathway_audio_scripts").select("pathway_slug,status"),
      service.from("pathway_video_projects").select("id,pathway_slug,audio_content_hash,timeline,style,updated_at"),
      service.from("pathway_video_renders").select("id,pathway_slug,format,status,output_url,error,requested_at,completed_at").order("requested_at", { ascending: false }).limit(100)
    ]);

    assetRows = (assetsResult.data ?? []) as AudioAssetRow[];
    scriptRows = (scriptsResult.data ?? []) as ScriptRow[];
    projectRows = (projectsResult.data ?? []) as ProjectRow[];
    renderRows = (rendersResult.data ?? []) as RenderRow[];
    databaseReady = !projectsResult.error && !rendersResult.error;

    if (assetsResult.error) console.error("video studio audio asset load failed", assetsResult.error.message);
    if (scriptsResult.error) console.error("video studio script load failed", scriptsResult.error.message);
    if (projectsResult.error) console.error("video studio project load failed", projectsResult.error.message);
    if (rendersResult.error) console.error("video studio render load failed", rendersResult.error.message);
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

  return <PathwayVideoStudio pathways={pathways} databaseReady={databaseReady}/>;
}

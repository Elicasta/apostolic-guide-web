import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { normalizePathwayVideoPublishingMetadata } from "@/pathway-video-publishing";
import { getPublishingHealth } from "@/publishing-health";
import { getSocialPublishingCredentialStatus } from "@/social-publishing-integrations";
import { createServiceClient } from "@/supabase";
import { UnifiedPublishingWorkspace } from "@/unified-publishing-workspace";

type RenderRow = {
  id: string;
  pathway_slug: string;
  asset_id: string | null;
  format: "youtube" | "vertical" | "square";
  status: "queued" | "rendering" | "completed" | "failed";
  output_url: string | null;
  requested_at: string;
  completed_at: string | null;
};

type KitRow = {
  pathway_slug: string;
  metadata: unknown;
  thumbnail_background_url: string | null;
  updated_at: string;
};

type PublicationRow = {
  id: string;
  pathway_slug: string;
  asset_id: string | null;
  platform: string;
  status: "draft" | "ready" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  external_post_id: string | null;
  published_url: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  error_message: string | null;
  metadata: unknown;
  created_at: string;
};

type SocialClipRow = {
  id: string;
  pathway_slug: string;
  source_render_id: string;
  asset_id: string | null;
  platform: "instagram" | "tiktok" | "both";
  rank: number;
  score: number;
  start_seconds: number;
  end_seconds: number;
  hook: string;
  title: string;
  rationale: string;
  caption: string;
  status: "candidate" | "queued" | "rendering" | "completed" | "failed" | "archived";
  output_url: string | null;
  error: string | null;
  model: string | null;
  analysis_metadata: unknown;
  created_at: string;
  completed_at: string | null;
};

export default async function AdminPublishingPage({ searchParams }: { searchParams: Promise<{ projectId?: string; threadId?: string; view?: string }> }) {
  const [viewPermission, managePermission] = await Promise.all([
    getStudioPermission("view_distribution"),
    getStudioPermission("manage_distribution")
  ]);
  if (!viewPermission.allowed || viewPermission.access.state !== "allowed") redirect("/admin");

  const [query, health, credentials] = await Promise.all([
    searchParams,
    getPublishingHealth(),
    getSocialPublishingCredentialStatus().catch(() => [])
  ]);
  const service = createServiceClient();
  let renders: RenderRow[] = [];
  let kits: KitRow[] = [];
  let publications: PublicationRow[] = [];
  let clips: SocialClipRow[] = [];

  if (service) {
    const [renderResult, kitResult, publicationResult, clipResult] = await Promise.all([
      service.from("pathway_video_renders").select("id,pathway_slug,asset_id,format,status,output_url,requested_at,completed_at").order("requested_at", { ascending: false }).limit(250),
      service.from("pathway_video_publishing_kits").select("pathway_slug,metadata,thumbnail_background_url,updated_at"),
      service.from("pathway_publications").select("id,pathway_slug,asset_id,platform,status,external_post_id,published_url,scheduled_for,published_at,error_message,metadata,created_at").order("created_at", { ascending: false }).limit(250),
      service.from("pathway_social_clips").select("id,pathway_slug,source_render_id,asset_id,platform,rank,score,start_seconds,end_seconds,hook,title,rationale,caption,status,output_url,error,model,analysis_metadata,created_at,completed_at").neq("status", "archived").order("created_at", { ascending: false }).limit(250)
    ]);
    renders = (renderResult.data ?? []) as RenderRow[];
    kits = (kitResult.data ?? []) as KitRow[];
    publications = (publicationResult.data ?? []) as PublicationRow[];
    clips = (clipResult.data ?? []) as SocialClipRow[];
    if (renderResult.error) console.error("master publishing render load failed", renderResult.error.message);
    if (kitResult.error) console.error("master publishing kit load failed", kitResult.error.message);
    if (publicationResult.error) console.error("master publishing publication load failed", publicationResult.error.message);
    if (clipResult.error) console.error("master publishing clip load failed", clipResult.error.message);
  }

  const kitMap = new Map(kits.map((kit) => [kit.pathway_slug, kit]));
  const byPathway = new Map<string, RenderRow[]>();
  for (const render of renders) byPathway.set(render.pathway_slug, [...(byPathway.get(render.pathway_slug) ?? []), render]);
  const publicationMap = new Map<string, PublicationRow[]>();
  for (const publication of publications) publicationMap.set(publication.pathway_slug, [...(publicationMap.get(publication.pathway_slug) ?? []), publication]);
  const clipMap = new Map<string, SocialClipRow[]>();
  for (const clip of clips) clipMap.set(clip.pathway_slug, [...(clipMap.get(clip.pathway_slug) ?? []), clip]);

  const packages = allPathways.map((pathway) => {
    const pathwayRenders = byPathway.get(pathway.slug) ?? [];
    const latestCompleted = (format: RenderRow["format"]) => pathwayRenders.find((render) => render.format === format && render.status === "completed" && render.output_url) ?? null;
    const kit = kitMap.get(pathway.slug) ?? null;
    const pathwayClips = (clipMap.get(pathway.slug) ?? []).sort((a, b) => a.rank - b.rank || b.created_at.localeCompare(a.created_at));
    return {
      slug: pathway.slug,
      title: pathway.title,
      summary: pathway.summary,
      youtubeRender: latestCompleted("youtube"),
      verticalRender: latestCompleted("vertical"),
      squareRender: latestCompleted("square"),
      publishingKit: kit ? {
        metadata: normalizePathwayVideoPublishingMetadata(kit.metadata),
        thumbnailBackgroundUrl: kit.thumbnail_background_url,
        updatedAt: kit.updated_at
      } : null,
      publications: publicationMap.get(pathway.slug) ?? [],
      socialClips: pathwayClips
    };
  }).filter((item) => item.youtubeRender || item.verticalRender || item.publishingKit || item.publications.length || item.socialClips.length);

  const failed = health.checks.filter((check) => !check.ok);
  const initialView = query.view === "video" ? "video" as const : query.view === "threads" ? "threads" as const : query.view === "calendar" ? "calendar" as const : "creative" as const;

  return <>
    <section className="master-publishing-health">
      <div className={health.ok ? "creative-success-banner" : "creative-error-banner"}>
        {health.ok ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>} 
        <div>
          <strong>{health.ok ? "Publishing runtime ready" : `${failed.length} publishing ${failed.length === 1 ? "dependency needs" : "dependencies need"} attention`}</strong>
          <div>{health.ok ? "Persistence, media storage, scheduler, channel credentials, and publishing stores passed preflight." : failed.map((check) => `${check.label}: ${check.detail}`).join(" · ")}</div>
        </div>
      </div>
    </section>
    <UnifiedPublishingWorkspace
      initialProjectId={query.projectId ?? null}
      initialThreadId={query.threadId ?? null}
      initialView={initialView}
      channel={{
        packages,
        credentials,
        canPublish: managePermission.allowed && managePermission.access.state === "allowed"
      }}
    />
  </>;
}

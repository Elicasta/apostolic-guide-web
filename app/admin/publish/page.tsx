import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { ChannelPublishing } from "@/channel-publishing";
import { normalizePathwayVideoPublishingMetadata } from "@/pathway-video-publishing";
import { getSocialPublishingCredentialStatus } from "@/social-publishing-integrations";
import { createServiceClient } from "@/supabase";

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

export default async function AdminChannelPublishingPage() {
  const [viewPermission, managePermission] = await Promise.all([
    getStudioPermission("view_distribution"),
    getStudioPermission("manage_distribution")
  ]);
  if (!viewPermission.allowed || viewPermission.access.state !== "allowed") redirect("/admin");

  const service = createServiceClient();
  const credentials = await getSocialPublishingCredentialStatus().catch(() => []);
  let renders: RenderRow[] = [];
  let kits: KitRow[] = [];
  let publications: PublicationRow[] = [];

  if (service) {
    const [renderResult, kitResult, publicationResult] = await Promise.all([
      service.from("pathway_video_renders")
        .select("id,pathway_slug,asset_id,format,status,output_url,requested_at,completed_at")
        .order("requested_at", { ascending: false })
        .limit(250),
      service.from("pathway_video_publishing_kits")
        .select("pathway_slug,metadata,thumbnail_background_url,updated_at"),
      service.from("pathway_publications")
        .select("id,pathway_slug,asset_id,platform,status,external_post_id,published_url,scheduled_for,published_at,error_message,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(250)
    ]);
    renders = (renderResult.data ?? []) as RenderRow[];
    kits = (kitResult.data ?? []) as KitRow[];
    publications = (publicationResult.data ?? []) as PublicationRow[];
    if (renderResult.error) console.error("channel publishing render load failed", renderResult.error.message);
    if (kitResult.error) console.error("channel publishing kit load failed", kitResult.error.message);
    if (publicationResult.error) console.error("channel publishing publication load failed", publicationResult.error.message);
  }

  const kitMap = new Map(kits.map((kit) => [kit.pathway_slug, kit]));
  const byPathway = new Map<string, RenderRow[]>();
  for (const render of renders) byPathway.set(render.pathway_slug, [...(byPathway.get(render.pathway_slug) ?? []), render]);
  const publicationMap = new Map<string, PublicationRow[]>();
  for (const publication of publications) publicationMap.set(publication.pathway_slug, [...(publicationMap.get(publication.pathway_slug) ?? []), publication]);

  const packages = allPathways.map((pathway) => {
    const pathwayRenders = byPathway.get(pathway.slug) ?? [];
    const latestCompleted = (format: RenderRow["format"]) => pathwayRenders.find((render) => render.format === format && render.status === "completed" && render.output_url) ?? null;
    const kit = kitMap.get(pathway.slug) ?? null;
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
      publications: publicationMap.get(pathway.slug) ?? []
    };
  }).filter((item) => item.youtubeRender || item.verticalRender || item.publishingKit || item.publications.length);

  return <ChannelPublishing
    packages={packages}
    credentials={credentials}
    canPublish={managePermission.allowed && managePermission.access.state === "allowed"}
  />;
}

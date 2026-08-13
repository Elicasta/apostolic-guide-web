import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { normalizePathwayVideoPublishingMetadata } from "@/pathway-video-publishing";
import { normalizeSocialClipPackage } from "@/social-clip-package";
import { executeScheduledPublication } from "@/scheduled-publishing";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  platform: z.enum(["youtube", "instagram"]),
  renderId: z.string().uuid().optional(),
  clipId: z.string().uuid().optional(),
  privacyStatus: z.enum(["private", "unlisted", "public"]).optional()
}).refine((value) => Boolean(value.renderId) !== Boolean(value.clipId), { message: "Choose exactly one publishing source." });

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid publishing request." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  let assetId: string | null = null;
  let metadata: Record<string, unknown> = {};

  if (parsed.data.clipId) {
    if (parsed.data.platform !== "instagram") return NextResponse.json({ error: "AI short clips can currently publish directly to Instagram. TikTok activates after Direct Post approval." }, { status: 400 });
    const clipResult = await service.from("pathway_social_clips")
      .select("id,asset_id,status,output_url,caption,title,analysis_metadata")
      .eq("id", parsed.data.clipId)
      .eq("pathway_slug", pathway.slug)
      .maybeSingle();
    if (clipResult.error) return NextResponse.json({ error: clipResult.error.message }, { status: 500 });
    const clip = clipResult.data;
    if (!clip?.output_url || clip.status !== "completed") return NextResponse.json({ error: "Render the selected AI clip before publishing it." }, { status: 409 });
    const social = normalizeSocialClipPackage(clip.analysis_metadata);
    assetId = clip.asset_id;
    metadata = {
      source_kind: "clip",
      clip_id: clip.id,
      caption: social.instagramCaption || clip.caption,
      hashtags: social.hashtags,
      cover_url: social.coverUrl,
      title: clip.title
    };
  } else if (parsed.data.renderId) {
    const renderResult = await service.from("pathway_video_renders")
      .select("id,asset_id,format,status,output_url")
      .eq("id", parsed.data.renderId)
      .eq("pathway_slug", pathway.slug)
      .maybeSingle();
    if (renderResult.error) return NextResponse.json({ error: renderResult.error.message }, { status: 500 });
    const render = renderResult.data;
    if (!render?.output_url || render.status !== "completed") return NextResponse.json({ error: "The selected render is not ready." }, { status: 409 });
    if (parsed.data.platform === "youtube" && render.format !== "youtube") return NextResponse.json({ error: "YouTube requires the 16:9 render." }, { status: 409 });
    if (parsed.data.platform === "instagram" && render.format !== "vertical") return NextResponse.json({ error: "Instagram requires the 9:16 render." }, { status: 409 });
    assetId = render.asset_id;
    metadata = { source_kind: "render", render_id: render.id };
  }

  const kitResult = await service.from("pathway_video_publishing_kits").select("metadata").eq("pathway_slug", pathway.slug).maybeSingle();
  if (kitResult.error) return NextResponse.json({ error: kitResult.error.message }, { status: 500 });
  const kit = normalizePathwayVideoPublishingMetadata(kitResult.data?.metadata);
  if (parsed.data.platform === "youtube") metadata = { ...metadata, requested_privacy: parsed.data.privacyStatus ?? "private", title: kit.youtubeTitle };
  if (parsed.data.platform === "instagram" && !metadata.caption) metadata = { ...metadata, caption: kit.reelCaption };

  if (assetId) {
    const existing = await service.from("pathway_publications")
      .select("id,status,published_url")
      .eq("asset_id", assetId)
      .eq("platform", parsed.data.platform)
      .in("status", ["publishing", "published"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
    if (existing.data?.status === "published") return NextResponse.json({ error: "This asset is already published on that channel.", publishedUrl: existing.data.published_url }, { status: 409 });
    if (existing.data?.status === "publishing") return NextResponse.json({ error: "This asset is already publishing." }, { status: 409 });
  }

  const publication = await service.from("pathway_publications").insert({
    pathway_slug: pathway.slug,
    asset_id: assetId,
    platform: parsed.data.platform,
    status: "scheduled",
    scheduled_for: new Date().toISOString(),
    metadata
  }).select("id").single();
  if (publication.error) return NextResponse.json({ error: publication.error.message }, { status: 500 });

  try {
    const result = await executeScheduledPublication(publication.data.id);
    return NextResponse.json({ ok: true, result, message: `${parsed.data.platform === "youtube" ? "YouTube" : "Instagram"} publishing completed.` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publishing failed." }, { status: 502 });
  }
}

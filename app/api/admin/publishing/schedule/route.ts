import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { normalizePathwayVideoPublishingMetadata } from "@/pathway-video-publishing";
import { normalizeSocialClipPackage } from "@/social-clip-package";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  platform: z.enum(["youtube", "instagram", "tiktok"]),
  renderId: z.string().uuid().optional(),
  clipId: z.string().uuid().optional(),
  scheduledFor: z.string().datetime(),
  privacyStatus: z.enum(["private", "unlisted", "public"]).optional()
}).refine((value) => Boolean(value.renderId) !== Boolean(value.clipId), { message: "Choose exactly one publishing source." });

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid scheduling request." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
  const when = new Date(parsed.data.scheduledFor);
  if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 60_000) return NextResponse.json({ error: "Choose a publishing time at least one minute from now." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  let assetId: string | null = null;
  let metadata: Record<string, unknown> = {};
  if (parsed.data.clipId) {
    if (parsed.data.platform === "youtube") return NextResponse.json({ error: "AI short clips can be scheduled for Instagram or TikTok, not the long-form YouTube slot." }, { status: 400 });
    const clipResult = await service.from("pathway_social_clips")
      .select("id,pathway_slug,asset_id,status,output_url,caption,title,analysis_metadata")
      .eq("id", parsed.data.clipId)
      .eq("pathway_slug", pathway.slug)
      .maybeSingle();
    if (clipResult.error) return NextResponse.json({ error: clipResult.error.message }, { status: 500 });
    const clip = clipResult.data;
    if (!clip?.output_url || clip.status !== "completed") return NextResponse.json({ error: "Render the selected AI clip before scheduling it." }, { status: 409 });
    const social = normalizeSocialClipPackage(clip.analysis_metadata);
    assetId = clip.asset_id;
    metadata = {
      source_kind: "clip",
      clip_id: clip.id,
      caption: parsed.data.platform === "instagram" ? (social.instagramCaption || clip.caption) : (social.tiktokCaption || clip.caption),
      hashtags: social.hashtags,
      cover_url: social.coverUrl,
      title: clip.title
    };
  } else if (parsed.data.renderId) {
    const renderResult = await service.from("pathway_video_renders")
      .select("id,pathway_slug,asset_id,format,status,output_url")
      .eq("id", parsed.data.renderId)
      .eq("pathway_slug", pathway.slug)
      .maybeSingle();
    if (renderResult.error) return NextResponse.json({ error: renderResult.error.message }, { status: 500 });
    const render = renderResult.data;
    if (!render?.output_url || render.status !== "completed") return NextResponse.json({ error: "The selected render is not ready." }, { status: 409 });
    if (parsed.data.platform === "youtube" && render.format !== "youtube") return NextResponse.json({ error: "YouTube scheduling requires the 16:9 render." }, { status: 409 });
    if (parsed.data.platform !== "youtube" && render.format !== "vertical") return NextResponse.json({ error: "Instagram and TikTok scheduling require the 9:16 render." }, { status: 409 });
    assetId = render.asset_id;
    metadata = { source_kind: "render", render_id: render.id };
  }

  const kitResult = await service.from("pathway_video_publishing_kits").select("metadata").eq("pathway_slug", pathway.slug).maybeSingle();
  if (kitResult.error) return NextResponse.json({ error: kitResult.error.message }, { status: 500 });
  const kit = normalizePathwayVideoPublishingMetadata(kitResult.data?.metadata);
  if (parsed.data.platform === "youtube") metadata = { ...metadata, requested_privacy: parsed.data.privacyStatus ?? "private", title: kit.youtubeTitle };
  if (parsed.data.platform === "instagram" && !metadata.caption) metadata = { ...metadata, caption: kit.reelCaption };
  if (parsed.data.platform === "tiktok" && !metadata.caption) metadata = { ...metadata, caption: kit.tiktokCaption };

  if (assetId) {
    const duplicate = await service.from("pathway_publications")
      .select("id,status,scheduled_for,published_url")
      .eq("asset_id", assetId)
      .eq("platform", parsed.data.platform)
      .in("status", ["scheduled", "publishing", "published"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (duplicate.error) return NextResponse.json({ error: duplicate.error.message }, { status: 500 });
    if (duplicate.data) {
      const message = duplicate.data.status === "scheduled"
        ? "This video is already on the publishing calendar for that channel."
        : duplicate.data.status === "publishing"
          ? "This video is already being published to that channel."
          : "This video has already been published to that channel.";
      return NextResponse.json({ error: message, publication: duplicate.data }, { status: 409 });
    }
  }

  const created = await service.from("pathway_publications").insert({
    pathway_slug: pathway.slug,
    asset_id: assetId,
    platform: parsed.data.platform,
    status: "scheduled",
    scheduled_for: when.toISOString(),
    metadata
  }).select("id,pathway_slug,asset_id,platform,status,scheduled_for,metadata,created_at").single();
  if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });

  return NextResponse.json({ publication: created.data, message: parsed.data.platform === "tiktok" ? "Added to the calendar. TikTok will remain a manual post until Direct Post is authorized." : "Scheduled for automatic publishing." });
}

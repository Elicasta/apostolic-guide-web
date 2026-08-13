import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { normalizeSocialClipPackage } from "@/social-clip-package";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  clipId: z.string().uuid(),
  regenerate: z.boolean().optional().default(false)
});

async function rendererCredentials(service: ReturnType<typeof createServiceClient>) {
  let token = process.env.VIDEO_STUDIO_GITHUB_TOKEN?.trim() || "";
  let repository = process.env.VIDEO_STUDIO_GITHUB_REPOSITORY?.trim() || "Elicasta/apostolic-guide-web";
  if (token || !service) return { token, repository };

  const { data, error } = await service.schema("analytics").from("integration_secrets")
    .select("name,secret")
    .in("name", ["video_studio_github_token", "video_studio_github_repository"]);
  if (error) throw new Error(error.message);
  const values = new Map((data ?? []).map((row) => [row.name, row.secret]));
  token = values.get("video_studio_github_token")?.trim() || "";
  repository = values.get("video_studio_github_repository")?.trim() || repository;
  return { token, repository };
}

function callbackOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the canonical production origin.
    }
  }
  const origin = new URL(request.url).origin;
  return origin.includes("localhost") ? origin : "https://www.apostolicguide.com";
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid clip request." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const clipResult = await service.from("pathway_social_clips")
    .select("id,pathway_slug,source_render_id,asset_id,platform,rank,score,start_seconds,end_seconds,hook,title,rationale,caption,status,output_url,analysis_metadata")
    .eq("id", parsed.data.clipId)
    .maybeSingle();
  if (clipResult.error) return NextResponse.json({ error: clipResult.error.message }, { status: 500 });
  const clip = clipResult.data;
  if (!clip) return NextResponse.json({ error: "Social clip not found." }, { status: 404 });
  if (!parsed.data.regenerate && clip.status === "completed" && clip.output_url) return NextResponse.json({ clip, queued: false });
  const pathway = pathwayBySlug(clip.pathway_slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  const sourceResult = await service.from("pathway_video_renders")
    .select("id,format,status,output_url")
    .eq("id", clip.source_render_id)
    .maybeSingle();
  if (sourceResult.error) return NextResponse.json({ error: sourceResult.error.message }, { status: 500 });
  if (!sourceResult.data?.output_url || sourceResult.data.status !== "completed" || sourceResult.data.format !== "vertical") {
    return NextResponse.json({ error: "The source 9:16 render is not ready." }, { status: 409 });
  }

  let token = "";
  let repository = "Elicasta/apostolic-guide-web";
  try {
    ({ token, repository } = await rendererCredentials(service));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Renderer credentials could not be loaded." }, { status: 500 });
  }
  if (!token) return NextResponse.json({
    error: "Video renderer is not connected. Open Setup → Video renderer and add the GitHub Actions token first.",
    code: "renderer_not_connected",
    setupUrl: "/admin/setup#video-renderer"
  }, { status: 503 });

  let assetId = clip.asset_id as string | null;
  if (!assetId) {
    const platform = clip.platform === "both" ? "instagram_tiktok" : clip.platform;
    const assetResult = await service.from("pathway_assets").insert({
      pathway_slug: pathway.slug,
      type: "short_video",
      title: `${pathway.title} · AI clip ${clip.rank}`,
      language: "en",
      status: "in_production",
      platform,
      source_url: sourceResult.data.output_url,
      cta_type: "visit_pathway",
      destination_url: `https://www.apostolicguide.com/pathways/${pathway.slug}`,
      notes: `AI-selected animated short-form cut. Viral potential score ${clip.score}/100.`
    }).select("id").single();
    if (assetResult.error) return NextResponse.json({ error: assetResult.error.message }, { status: 500 });
    assetId = assetResult.data.id;
  }

  const storagePath = `pathways/${pathway.slug}/social-clips/${clip.id}.mp4`;
  const coverStoragePath = `pathways/${pathway.slug}/social-clips/${clip.id}-cover.jpg`;
  const callbackToken = randomBytes(32).toString("hex");
  const callbackTokenHash = createHash("sha256").update(callbackToken).digest("hex");
  const [signedUpload, signedCoverUpload] = await Promise.all([
    service.storage.from("pathway-video").createSignedUploadUrl(storagePath, { upsert: true }),
    service.storage.from("pathway-thumbnail").createSignedUploadUrl(coverStoragePath, { upsert: true })
  ]);
  if (signedUpload.error || !signedUpload.data?.signedUrl) {
    return NextResponse.json({ error: `Could not create signed clip upload URL: ${signedUpload.error?.message ?? "unknown storage error"}` }, { status: 500 });
  }
  if (signedCoverUpload.error || !signedCoverUpload.data?.signedUrl) {
    return NextResponse.json({ error: `Could not create signed cover upload URL: ${signedCoverUpload.error?.message ?? "unknown storage error"}` }, { status: 500 });
  }

  const publicUrl = service.storage.from("pathway-video").getPublicUrl(storagePath).data.publicUrl;
  const coverPublicUrl = service.storage.from("pathway-thumbnail").getPublicUrl(coverStoragePath).data.publicUrl;
  const callbackUrl = `${callbackOrigin(request)}/api/admin/publishing/viral-clips/render-callback`;
  const now = new Date().toISOString();
  const existingMetadata = clip.analysis_metadata && typeof clip.analysis_metadata === "object"
    ? clip.analysis_metadata as Record<string, unknown>
    : {};
  const socialPackage = normalizeSocialClipPackage(existingMetadata);
  const queuedMetadata = {
    ...existingMetadata,
    renderBridge: { publicUrl, coverPublicUrl, coverStoragePath, coverBucket: "pathway-thumbnail" },
    renderProgress: { progress: 1, stage: "Queued for render worker", updatedAt: now },
    requestedAt: now
  };
  const prepared = await service.from("pathway_social_clips").update({
    asset_id: assetId,
    status: "queued",
    error: null,
    storage_path: storagePath,
    callback_token_hash: callbackTokenHash,
    analysis_metadata: queuedMetadata,
    updated_at: now
  }).eq("id", clip.id);
  if (prepared.error) return NextResponse.json({ error: prepared.error.message }, { status: 500 });

  const dispatch = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "apostolic-guide-publishing-suite",
      "x-github-api-version": "2022-11-28"
    },
    body: JSON.stringify({
      event_type: "pathway-social-clip-render",
      client_payload: {
        clip_id: clip.id,
        source_url: sourceResult.data.output_url,
        start_seconds: Number(clip.start_seconds),
        end_seconds: Number(clip.end_seconds),
        upload_url: signedUpload.data.signedUrl,
        cover_upload_url: signedCoverUpload.data.signedUrl,
        callback_url: callbackUrl,
        callback_token: callbackToken,
        creative: {
          pathway: pathway.title,
          title: clip.title,
          hook: clip.hook,
          cover_headline: socialPackage.coverHeadline || clip.title,
          cover_subline: socialPackage.coverSubline || pathway.title,
          caption_cues: socialPackage.captionCues
        }
      }
    })
  });

  if (!dispatch.ok) {
    const detail = (await dispatch.text().catch(() => "")).slice(0, 800);
    const error = `Social clip renderer dispatch failed (${dispatch.status})${detail ? `: ${detail}` : ""}`;
    const failedAt = new Date().toISOString();
    await Promise.all([
      service.from("pathway_social_clips").update({
        status: "failed",
        error,
        analysis_metadata: {
          ...queuedMetadata,
          renderProgress: { progress: 1, stage: "Failed to start renderer", updatedAt: failedAt }
        },
        updated_at: failedAt
      }).eq("id", clip.id),
      assetId ? service.from("pathway_assets").update({ status: "blocked", notes: error, updated_at: failedAt }).eq("id", assetId) : Promise.resolve({ error: null })
    ]);
    return NextResponse.json({ error }, { status: 502 });
  }

  return NextResponse.json({
    clip: { ...clip, asset_id: assetId, status: "queued", analysis_metadata: queuedMetadata },
    queued: true
  });
}

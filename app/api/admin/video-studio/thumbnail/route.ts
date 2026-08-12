import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { normalizePathwayVideoPublishingMetadata } from "@/pathway-video-publishing";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  quality: z.enum(["low", "medium"]).optional().default("low")
});

type ImageGenerationResponse = {
  data?: Array<{ b64_json?: string; revised_prompt?: string }>;
};

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid thumbnail request." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const [assetResult, kitResult] = await Promise.all([
    service.from("pathway_audio_assets").select("content_hash").eq("pathway_slug", pathway.slug).maybeSingle(),
    service.from("pathway_video_publishing_kits")
      .select("audio_content_hash,metadata,thumbnail_storage_path")
      .eq("pathway_slug", pathway.slug)
      .maybeSingle()
  ]);
  if (assetResult.error) return NextResponse.json({ error: assetResult.error.message }, { status: 500 });
  if (kitResult.error) return NextResponse.json({ error: kitResult.error.message }, { status: 500 });
  if (!kitResult.data) return NextResponse.json({ error: "Generate the GPT-5.6 publishing kit before creating its thumbnail." }, { status: 409 });
  if (!assetResult.data?.content_hash || kitResult.data.audio_content_hash !== assetResult.data.content_hash) return NextResponse.json({ error: "The Pathway audio changed after this publishing kit was generated. Regenerate the publishing kit first." }, { status: 409 });

  const metadata = normalizePathwayVideoPublishingMetadata(kitResult.data.metadata);
  if (!metadata.thumbnailImagePrompt) return NextResponse.json({ error: "The publishing kit does not contain a thumbnail image prompt." }, { status: 409 });
  const imageModel = process.env.OPENAI_VIDEO_THUMBNAIL_MODEL?.trim() || "gpt-image-2";
  const prompt = [
    metadata.thumbnailImagePrompt,
    "Create a cinematic YouTube thumbnail BACKGROUND only in a wide horizontal composition.",
    "Reserve clean negative space on the left third for a large editorial title overlay added later by Apostolic Guide.",
    "No text, no letters, no numbers, no logos, no watermarks, no captions, no UI, no border.",
    "Photorealistic or tactile documentary realism. Strong single focal point, clear separation, readable at small size, restrained color and lighting."
  ].join("\n");

  const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: imageModel,
      prompt,
      size: "1536x1024",
      quality: parsed.data.quality,
      output_format: "png",
      background: "opaque",
      n: 1
    })
  });
  if (!imageResponse.ok) {
    const detail = (await imageResponse.text().catch(() => "")).slice(0, 1600);
    return NextResponse.json({ error: `Thumbnail background generation failed (${imageResponse.status}).`, detail }, { status: 502 });
  }
  const result = await imageResponse.json() as ImageGenerationResponse;
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) return NextResponse.json({ error: "The image model did not return thumbnail image data." }, { status: 502 });

  const image = Buffer.from(b64, "base64");
  const storagePath = `pathways/${pathway.slug}/${Date.now()}-${parsed.data.quality}.png`;
  const uploaded = await service.storage.from("pathway-thumbnail").upload(storagePath, image, { contentType: "image/png", upsert: false });
  if (uploaded.error) return NextResponse.json({ error: uploaded.error.message }, { status: 500 });
  const publicUrl = service.storage.from("pathway-thumbnail").getPublicUrl(storagePath).data.publicUrl;

  const oldPath = kitResult.data.thumbnail_storage_path;
  const now = new Date().toISOString();
  const saved = await service.from("pathway_video_publishing_kits")
    .update({
      thumbnail_background_url: publicUrl,
      thumbnail_storage_path: storagePath,
      image_model: imageModel,
      image_quality: parsed.data.quality,
      updated_by: access.user.id,
      updated_at: now
    })
    .eq("pathway_slug", pathway.slug)
    .select("pathway_slug,audio_content_hash,metadata,thumbnail_background_url,thumbnail_storage_path,text_model,image_model,image_quality,updated_at")
    .single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  if (oldPath && oldPath !== storagePath) {
    const removed = await service.storage.from("pathway-thumbnail").remove([oldPath]);
    if (removed.error) console.error("old pathway thumbnail cleanup failed", removed.error.message);
  }

  return NextResponse.json({ kit: saved.data, revisedPrompt: result.data?.[0]?.revised_prompt ?? null });
}

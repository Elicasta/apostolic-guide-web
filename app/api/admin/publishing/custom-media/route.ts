import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { executeScheduledPublication } from "@/scheduled-publishing";
import { allPathways, pathwayBySlug } from "@/pathway-catalog";
import { privateBlobReadUrl } from "@/private-blob";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

const mediaFormat = z.enum(["image", "reel", "long_form"]);
const platform = z.enum(["instagram", "youtube"]);
const commonFields = {
  assetId: z.string().uuid(),
  pathwaySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  platform,
  mediaFormat,
  title: z.string().trim().max(180).default(""),
  brief: z.string().trim().max(3000).default(""),
  description: z.string().trim().max(5000).default(""),
  caption: z.string().trim().max(10000).default(""),
  altText: z.string().trim().max(500).default(""),
  hashtags: z.array(z.string().trim().max(80)).max(20).default([]),
  tags: z.array(z.string().trim().max(80)).max(40).default([]),
  internalTags: z.array(z.string().trim().max(80)).max(30).default([]),
  privacyStatus: z.enum(["private", "unlisted", "public"]).default("private")
};
const generateSchema = z.object({ action: z.literal("generate"), ...commonFields });
const saveSchema = z.object({ action: z.literal("save"), ...commonFields });
const publishSchema = z.object({
  action: z.literal("publish"),
  ...commonFields,
  mode: z.enum(["publish_now", "schedule"]),
  scheduledFor: z.string().datetime().optional()
}).superRefine((value, ctx) => {
  if (value.mode === "schedule" && !value.scheduledFor) ctx.addIssue({ code: "custom", message: "Choose a scheduled time." });
});
const requestSchema = z.discriminatedUnion("action", [generateSchema, saveSchema, publishSchema]);

const generatedSchema = z.object({
  title: z.string().trim().max(180),
  description: z.string().trim().max(5000),
  caption: z.string().trim().max(2200),
  altText: z.string().trim().max(500),
  hashtags: z.array(z.string().trim().min(1).max(80)).max(15),
  tags: z.array(z.string().trim().min(1).max(80)).max(30),
  internalTags: z.array(z.string().trim().min(1).max(80)).max(20)
});

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanList(value: string[], max: number) {
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

function extractText(value: unknown) {
  const response = record(value);
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    const content = record(item).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const object = record(part);
      if (object.type === "output_text" && typeof object.text === "string") return object.text;
    }
  }
  return "";
}

function extractJson(value: string) {
  const clean = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Sol returned no metadata object.");
  return JSON.parse(clean.slice(start, end + 1)) as unknown;
}

function mediaKind(asset: { metadata?: Record<string, unknown> | null }) {
  const metadata = record(asset.metadata);
  const mime = String(metadata.mimeType || metadata.mime || "").toLowerCase();
  return { mime, isImage: mime.startsWith("image/"), isVideo: mime.startsWith("video/") };
}

function validateDestination(input: { platform: "instagram" | "youtube"; mediaFormat: "image" | "reel" | "long_form"; isImage: boolean; isVideo: boolean }) {
  if (!input.isImage && !input.isVideo) return "Custom publishing accepts uploaded image or video assets only.";
  if (input.platform === "youtube" && !input.isVideo) return "YouTube custom publishing accepts video files only.";
  if (input.isImage && input.mediaFormat !== "image") return "Image files must use the Image / Graphic format.";
  if (input.isVideo && input.mediaFormat === "image") return "Video files must use Reel / Short Form or Long Form.";
  if (input.platform === "instagram" && input.isVideo && input.mediaFormat === "long_form") return "Instagram custom video publishes through the Reel lane. Choose Reel / Short Form.";
  return null;
}

async function loadAsset(service: NonNullable<ReturnType<typeof createServiceClient>>, assetId: string) {
  const result = await service.from("studio_pathway_assets")
    .select("id,pathway_slug,studio,asset_type,title,status,storage_bucket,storage_path,public_url,metadata")
    .eq("id", assetId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function saveAssetMetadata(
  service: NonNullable<ReturnType<typeof createServiceClient>>,
  userId: string,
  asset: NonNullable<Awaited<ReturnType<typeof loadAsset>>>,
  data: z.infer<typeof saveSchema> | z.infer<typeof publishSchema>
) {
  const pathway = pathwayBySlug(data.pathwaySlug);
  if (!pathway) throw new Error("Pathway not found.");
  const current = record(asset.metadata);
  const updated = await service.from("studio_pathway_assets").update({
    pathway_slug: pathway.slug,
    title: data.title || asset.title,
    metadata: {
      ...current,
      customPublishing: true,
      customBrief: data.brief,
      publishingDescription: data.description,
      publishingCaption: data.caption,
      publishingAltText: data.altText,
      publishingHashtags: cleanList(data.hashtags, 20),
      publishingTags: cleanList(data.tags, 40),
      internalTags: cleanList(data.internalTags, 30),
      mediaFormat: data.mediaFormat,
      preferredPlatform: data.platform,
      updatedForPublishingAt: new Date().toISOString()
    },
    updated_by: userId,
    updated_at: new Date().toISOString()
  }).eq("id", asset.id).select("id,pathway_slug,title,status,storage_bucket,storage_path,public_url,metadata").single();
  if (updated.error) throw new Error(updated.error.message);
  return updated.data;
}

async function upsertDraftCalendar(
  service: NonNullable<ReturnType<typeof createServiceClient>>,
  assetId: string,
  data: z.infer<typeof saveSchema>,
  title: string
) {
  const contentType = data.mediaFormat === "image" ? "image" : data.mediaFormat === "reel" ? "reel" : "video";
  const result = await service.from("studio_content_calendar_items").upsert({
    pathway_slug: data.pathwaySlug,
    title,
    content_type: contentType,
    platform: data.platform,
    status: "draft",
    scheduled_for: null,
    published_at: null,
    source: "custom-media-draft",
    source_ref: assetId,
    asset_id: null,
    publication_id: null,
    metadata: { custom_asset_id: assetId, media_format: data.mediaFormat, internal_tags: cleanList(data.internalTags, 30) },
    updated_at: new Date().toISOString()
  }, { onConflict: "source,source_ref" });
  if (result.error) throw new Error(result.error.message);
}

export async function GET() {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const result = await service.from("studio_pathway_assets")
    .select("id,pathway_slug,title,status,public_url,metadata,updated_at")
    .contains("metadata", { customPublishing: true })
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ assets: result.data ?? [], pathways: allPathways.map(({ slug, title, collection, summary }) => ({ slug, title, collection, summary })) });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid custom media request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    const asset = await loadAsset(service, parsed.data.assetId);
    if (!asset) return NextResponse.json({ error: "Uploaded media asset not found." }, { status: 404 });
    const kind = mediaKind(asset);
    const destinationError = validateDestination({ platform: parsed.data.platform, mediaFormat: parsed.data.mediaFormat, ...kind });
    if (destinationError) return NextResponse.json({ error: destinationError }, { status: 400 });
    const pathway = pathwayBySlug(parsed.data.pathwaySlug);
    if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

    if (parsed.data.action === "generate") {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured. You can still write the metadata manually." }, { status: 503 });
      const scripture = pathway.steps.map((step) => `${step.reference}: ${step.explanation}`).join("\n");
      const model = process.env.OPENAI_PUBLISHING_MODEL?.trim() || process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";
      const userContent: Array<Record<string, unknown>> = [{
        type: "input_text",
        text: [
          `DESTINATION: ${parsed.data.platform}`,
          `MEDIA FORMAT: ${parsed.data.mediaFormat}`,
          `PATHWAY: ${pathway.title}`,
          `PATHWAY SUMMARY: ${pathway.summary}`,
          `USER BRIEF: ${parsed.data.brief || "No extra brief supplied."}`,
          `CURRENT TITLE: ${parsed.data.title || asset.title}`,
          `SCRIPTURE CONTEXT:\n${scripture}`
        ].join("\n\n")
      }];
      if (kind.isImage && asset.storage_bucket === "vercel_blob" && asset.storage_path) {
        userContent.push({ type: "input_image", image_url: await privateBlobReadUrl(asset.storage_path, 15 * 60 * 1000), detail: "low" });
      }
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          reasoning: { effort: "low" },
          text: { verbosity: "low" },
          input: [
            {
              role: "developer",
              content: [{ type: "input_text", text: [
                "You are Sol, Apostolic Guide's publishing editor.",
                "Create platform-ready publishing metadata from the user's brief, selected Pathway, and visible media when supplied.",
                "Stay inside the supplied Pathway doctrine and Scripture context. Do not invent quotations, claims, or Scripture references.",
                "Keep internal library tags separate from public hashtags.",
                "For Instagram, prioritize a natural caption. For YouTube, prioritize a searchable title and useful description.",
                "Return ONLY valid JSON with exactly these keys:",
                '{"title":"","description":"","caption":"","altText":"","hashtags":[],"tags":[],"internalTags":[]}',
                "title max 100 chars for YouTube and 180 otherwise; description max 5000; caption max 2200; altText max 500.",
                "hashtags 3-10; tags are YouTube/search metadata without #; internalTags are library organization labels.",
                "No markdown outside the JSON."
              ].join("\n") }]
            },
            { role: "user", content: userContent }
          ]
        })
      });
      if (!response.ok) return NextResponse.json({ error: `Sol metadata generation failed (${response.status}). You can continue manually.` }, { status: 502 });
      const generated = generatedSchema.parse(extractJson(extractText(await response.json())));
      return NextResponse.json({ generated: { ...generated, hashtags: cleanList(generated.hashtags, 15), tags: cleanList(generated.tags, 30), internalTags: cleanList(generated.internalTags, 20) }, model });
    }

    const savedAsset = await saveAssetMetadata(service, access.user.id, asset, parsed.data);
    if (parsed.data.action === "save") {
      await upsertDraftCalendar(service, asset.id, parsed.data, savedAsset.title);
      return NextResponse.json({ asset: savedAsset, message: "Custom media draft saved and added to the Publishing calendar queue." });
    }

    const when = parsed.data.mode === "publish_now" ? new Date() : new Date(parsed.data.scheduledFor!);
    if (!Number.isFinite(when.getTime())) return NextResponse.json({ error: "Schedule time is invalid." }, { status: 400 });
    if (parsed.data.mode === "schedule" && when.getTime() < Date.now() + 60_000) return NextResponse.json({ error: "Choose a publishing time at least one minute from now." }, { status: 400 });

    const duplicate = await service.from("pathway_publications")
      .select("id,status,scheduled_for,published_url")
      .eq("platform", parsed.data.platform)
      .contains("metadata", { source_kind: "custom_asset", custom_asset_id: asset.id })
      .in("status", ["scheduled", "publishing", "published"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (duplicate.error) return NextResponse.json({ error: duplicate.error.message }, { status: 500 });
    if (duplicate.data) return NextResponse.json({ error: duplicate.data.status === "published" ? "This custom media is already published on that channel." : "This custom media already has an active publication on that channel.", publication: duplicate.data }, { status: 409 });

    const metadata = {
      source_kind: "custom_asset",
      custom_asset_id: asset.id,
      media_format: parsed.data.mediaFormat,
      mime_type: kind.mime,
      title: parsed.data.title || savedAsset.title,
      description: parsed.data.description,
      caption: parsed.data.caption,
      alt_text: parsed.data.altText,
      hashtags: cleanList(parsed.data.hashtags, 20),
      tags: cleanList(parsed.data.tags, 40),
      internal_tags: cleanList(parsed.data.internalTags, 30),
      requested_privacy: parsed.data.privacyStatus
    };
    const publication = await service.from("pathway_publications").insert({
      pathway_slug: parsed.data.pathwaySlug,
      asset_id: null,
      platform: parsed.data.platform,
      status: "scheduled",
      scheduled_for: when.toISOString(),
      metadata
    }).select("id,pathway_slug,platform,status,scheduled_for,metadata,created_at").single();
    if (publication.error) return NextResponse.json({ error: publication.error.message }, { status: 500 });

    const contentType = parsed.data.mediaFormat === "image" ? "image" : parsed.data.mediaFormat === "reel" ? "reel" : "video";
    const calendar = await service.from("studio_content_calendar_items").upsert({
      pathway_slug: parsed.data.pathwaySlug,
      title: parsed.data.title || savedAsset.title,
      content_type: contentType,
      platform: parsed.data.platform,
      status: "scheduled",
      scheduled_for: when.toISOString(),
      published_at: null,
      source: "custom-media",
      source_ref: publication.data.id,
      asset_id: null,
      publication_id: publication.data.id,
      metadata,
      updated_at: new Date().toISOString()
    }, { onConflict: "source,source_ref" });
    if (calendar.error) return NextResponse.json({ error: calendar.error.message }, { status: 500 });
    await service.from("studio_content_calendar_items").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("source", "custom-media-draft").eq("source_ref", asset.id);

    if (parsed.data.mode === "schedule") return NextResponse.json({ publication: publication.data, message: "Custom media scheduled and added to the Publishing calendar." }, { status: 201 });
    try {
      const result = await executeScheduledPublication(publication.data.id);
      return NextResponse.json({ publication: publication.data, result, message: `${parsed.data.platform === "youtube" ? "YouTube" : "Instagram"} publishing completed.` });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Publishing failed." }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Custom media request failed." }, { status: 500 });
  }
}

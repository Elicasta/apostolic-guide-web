import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import {
  normalizePathwayVideoPublishingMetadata,
  PATHWAY_VIDEO_PUBLISHING_JSON_SCHEMA
} from "@/pathway-video-publishing";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  action: z.enum(["generate", "save"]).default("generate"),
  metadata: z.record(z.string(), z.unknown()).optional()
});

function extractResponseText(value: unknown) {
  const response = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (record.type === "output_text" && typeof record.text === "string") return record.text;
    }
  }
  return "";
}

function safeJson(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

async function loadSource(slug: string) {
  const pathway = pathwayBySlug(slug);
  if (!pathway) return { error: "Pathway not found.", status: 404 as const };
  const service = createServiceClient();
  if (!service) return { error: "Supabase service access is not configured.", status: 503 as const };

  const [assetResult, scriptResult] = await Promise.all([
    service.from("pathway_audio_assets").select("audio_url,content_hash").eq("pathway_slug", pathway.slug).maybeSingle(),
    service.from("pathway_audio_scripts").select("script_text,script_hash,status").eq("pathway_slug", pathway.slug).maybeSingle()
  ]);
  if (assetResult.error) return { error: assetResult.error.message, status: 500 as const };
  if (scriptResult.error) return { error: scriptResult.error.message, status: 500 as const };
  if (!assetResult.data?.audio_url) return { error: "Generate Pathway audio before creating its publishing kit.", status: 409 as const };
  if (!scriptResult.data?.script_text || scriptResult.data.status !== "approved") return { error: "Approve the Pathway narration script before creating its publishing kit.", status: 409 as const };
  if (!scriptResult.data.script_hash || scriptResult.data.script_hash !== assetResult.data.content_hash) return { error: "The approved script changed after the audio was generated. Regenerate the audio before creating publishing copy.", status: 409 as const };

  return { pathway, service, asset: assetResult.data, script: scriptResult.data };
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: "Invalid Pathway." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const result = await service.from("pathway_video_publishing_kits")
    .select("pathway_slug,audio_content_hash,metadata,thumbnail_background_url,thumbnail_storage_path,text_model,image_model,image_quality,updated_at")
    .eq("pathway_slug", slug)
    .maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ kit: result.data ?? null });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid publishing kit request." }, { status: 400 });

  const source = await loadSource(parsed.data.slug);
  if ("error" in source) return NextResponse.json({ error: source.error }, { status: source.status });
  const { pathway, service, asset, script } = source;

  let metadata;
  let textModel = "manual";
  if (parsed.data.action === "save") {
    metadata = normalizePathwayVideoPublishingMetadata(parsed.data.metadata);
  } else {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
    textModel = process.env.OPENAI_VIDEO_PUBLISHING_MODEL?.trim() || "gpt-5.6-sol";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: textModel,
        reasoning: { effort: "medium" },
        text: {
          verbosity: "medium",
          format: {
            type: "json_schema",
            name: "apostolic_guide_video_publishing_kit",
            strict: true,
            schema: PATHWAY_VIDEO_PUBLISHING_JSON_SCHEMA
          }
        },
        input: [
          {
            role: "developer",
            content: [{ type: "input_text", text: [
              "You are the publishing strategist for Apostolic Guide.",
              "Create accurate, strong distribution copy for a Scripture-first Apostolic Christian teaching video.",
              "The approved narration below is the theological source of truth. Do not add doctrines, claims, historical assertions, promises, controversy, or sensational language that are not supported by it.",
              "Optimize for clarity, genuine search intent, clicks without clickbait, and retention from the right audience.",
              "YouTube titles should lead with the viewer question or strongest searchable claim, not internal product naming.",
              "YouTube descriptions should explain what the viewer will learn, naturally include the main Scripture references, mention the matching Apostolic Guide Pathway, and end with a clean call to continue studying at the supplied URL.",
              "Hashtags should be relevant and restrained. Do not stuff tags or repeat near-duplicates.",
              "Thumbnail text should be 2 to 5 words when possible, instantly readable, and distinct from the title.",
              "The thumbnail image prompt is for a background image only. It must request NO words, letters, logos, watermarks, UI, fake Scripture text, or typography. Leave intentional negative space for branded overlay text.",
              "Use a restrained cinematic documentary visual language. Avoid cheesy glowing religious fantasy, halos, kitschy church-stock imagery, and inaccurate modern objects in first-century scenes."
            ].join("\n") }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: [
              `PATHWAY: ${pathway.title}`,
              `SUMMARY: ${pathway.summary}`,
              `DESTINATION: https://www.apostolicguide.com/pathways/${pathway.slug}`,
              `SCRIPTURE FLOW: ${pathway.steps.map((step) => `${step.reference} — ${step.title}`).join(" | ")}`,
              "APPROVED NARRATION:",
              script.script_text
            ].join("\n\n") }]
          }
        ]
      })
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 1600);
      return NextResponse.json({ error: `Publishing copy generation failed (${response.status}).`, detail }, { status: 502 });
    }
    const result = await response.json();
    const outputText = extractResponseText(result);
    const decoded = safeJson(outputText);
    if (!decoded) return NextResponse.json({ error: "GPT-5.6 Sol returned publishing copy that could not be decoded." }, { status: 502 });
    metadata = normalizePathwayVideoPublishingMetadata(decoded);
  }

  const now = new Date().toISOString();
  const existingResult = await service.from("pathway_video_publishing_kits")
    .select("thumbnail_background_url,thumbnail_storage_path,image_model,image_quality")
    .eq("pathway_slug", pathway.slug)
    .maybeSingle();
  if (existingResult.error) return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
  const existing = existingResult.data;
  const saved = await service.from("pathway_video_publishing_kits")
    .upsert({
      pathway_slug: pathway.slug,
      audio_content_hash: asset.content_hash,
      metadata,
      thumbnail_background_url: existing?.thumbnail_background_url ?? null,
      thumbnail_storage_path: existing?.thumbnail_storage_path ?? null,
      text_model: textModel,
      image_model: existing?.image_model ?? null,
      image_quality: existing?.image_quality ?? null,
      created_by: access.user.id,
      updated_by: access.user.id,
      updated_at: now
    }, { onConflict: "pathway_slug" })
    .select("pathway_slug,audio_content_hash,metadata,thumbnail_background_url,thumbnail_storage_path,text_model,image_model,image_quality,updated_at")
    .single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
  return NextResponse.json({ kit: saved.data });
}

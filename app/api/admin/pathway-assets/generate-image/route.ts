import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  pathwaySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  creationType: z.enum(["single-post","story","thumbnail","background","other"]),
  visualStyle: z.enum(["street","editorial","cinematic","verse","manifesto"]).optional().default("editorial"),
  prompt: z.string().trim().min(3).max(4000),
  orientation: z.enum(["portrait","landscape","square"]).optional().default("portrait"),
  quality: z.enum(["low","medium"]).optional().default("low")
});

function extractText(value: unknown) {
  const response = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as Record<string, unknown>).type === "output_text" && typeof (part as Record<string, unknown>).text === "string") return String((part as Record<string, unknown>).text);
    }
  }
  return "";
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid image request." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.pathwaySlug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });

  const service = createServiceClient();
  const styleResult = service ? await service.from("studio_visual_style_profile").select("instructions,reference_asset_ids,metadata").eq("id", "apostolic-guide").maybeSingle() : null;
  const styleProfile = styleResult?.data?.instructions || "Apostolic Guide editorial brand system: restrained, Scripture-first, ink, paper, crimson, AG blue, strong negative space, no orange, no crowns.";
  const referenceIds = Array.isArray(styleResult?.data?.reference_asset_ids) ? styleResult!.data!.reference_asset_ids.filter((id): id is string => typeof id === "string").slice(-4) : [];
  const referenceUrls: string[] = [];
  if (service && referenceIds.length) {
    const refs = await service.from("studio_pathway_assets").select("id,storage_bucket,storage_path,public_url").in("id", referenceIds);
    if (!refs.error) {
      for (const ref of refs.data ?? []) {
        if (typeof ref.public_url === "string" && ref.public_url) {
          referenceUrls.push(ref.public_url);
          continue;
        }
        if (typeof ref.storage_bucket === "string" && typeof ref.storage_path === "string") {
          const signed = await service.storage.from(ref.storage_bucket).createSignedUrl(ref.storage_path, 15 * 60);
          if (!signed.error) referenceUrls.push(signed.data.signedUrl);
        }
      }
    }
  }

  const solModel = process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";
  const scripture = pathway.steps.slice(0, 8).map((step) => `${step.reference}: ${step.explanation}`).join("\n");
  const userContent: Array<Record<string, unknown>> = [{ type: "input_text", text: [
    `PATHWAY: ${pathway.title}`,
    `PATHWAY SUMMARY: ${pathway.summary}`,
    `CREATIVE REQUEST: ${parsed.data.prompt}`,
    `SCRIPTURE CONTEXT:\n${scripture}`,
    referenceUrls.length ? "The following images are previously approved Apostolic Guide visual references. Match their restraint, hierarchy, texture, photographic/editorial sensibility, and negative-space habits without copying their exact composition." : "No approved image references are saved yet."
  ].join("\n\n") }];
  for (const imageUrl of referenceUrls) userContent.push({ type: "input_image", image_url: imageUrl, detail: "low" });

  const directionResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: solModel,
      reasoning: { effort: "medium" },
      text: { verbosity: "low" },
      input: [
        { role: "developer", content: [{ type: "input_text", text: [
          "You are Sol, the visual director for Apostolic Guide.",
          "Turn the user's creative request into one precise image-generation prompt that matches the saved Apostolic Guide visual language and any approved reference images supplied.",
          "The image must remain editable downstream, so generate the VISUAL/PHOTOGRAPHIC/ILLUSTRATIVE LAYER ONLY. Do not put readable text, Scripture, logos, typography, UI, borders, watermarks, or captions into the image.",
          "Protect generous negative space for later HTML/CSS typography. Avoid random religious clichés, glowing crosses, crowns, fantasy heaven imagery, orange, neon color, and generic megachurch advertising aesthetics.",
          `SAVED VISUAL PROFILE:\n${styleProfile}`,
          `REQUESTED STYLE: ${parsed.data.visualStyle}`,
          `OUTPUT: ${parsed.data.creationType} / ${parsed.data.orientation}`
        ].join("\n\n") }] },
        { role: "user", content: userContent }
      ]
    })
  });
  if (!directionResponse.ok) return NextResponse.json({ error: `Sol image direction failed (${directionResponse.status}).`, detail: (await directionResponse.text().catch(() => "")).slice(0, 1200) }, { status: 502 });
  const imagePrompt = extractText(await directionResponse.json()).trim();
  if (!imagePrompt) return NextResponse.json({ error: "Sol returned no image direction." }, { status: 502 });

  const imageModel = parsed.data.creationType === "thumbnail"
    ? (process.env.OPENAI_VIDEO_THUMBNAIL_MODEL?.trim() || "gpt-image-2")
    : (process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1.5");
  const size = parsed.data.orientation === "landscape" ? "1536x1024" : parsed.data.orientation === "square" ? "1024x1024" : "1024x1536";
  const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: imageModel,
      prompt: imagePrompt,
      size,
      quality: parsed.data.quality,
      output_format: "webp",
      background: "opaque",
      n: 1
    })
  });
  if (!imageResponse.ok) return NextResponse.json({ error: `Image generation failed (${imageResponse.status}).`, detail: (await imageResponse.text().catch(() => "")).slice(0, 1600) }, { status: 502 });
  const result = await imageResponse.json() as { data?: Array<{ b64_json?: string; revised_prompt?: string }> };
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) return NextResponse.json({ error: "Image model returned no image data." }, { status: 502 });
  return NextResponse.json({ dataUrl: `data:image/webp;base64,${b64}`, prompt: imagePrompt, solModel, imageModel, size, referenceCount: referenceUrls.length, revisedPrompt: result.data?.[0]?.revised_prompt ?? null });
}

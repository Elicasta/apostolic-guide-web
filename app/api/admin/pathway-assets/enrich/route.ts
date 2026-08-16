import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { parsePathwayAssetEnrichment } from "@/pathway-asset-enrichment";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ assetId: z.string().uuid() });

function extractText(value: unknown) {
  const response = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as Record<string, unknown>).type === "output_text" && typeof (part as Record<string, unknown>).text === "string") {
        return String((part as Record<string, unknown>).text);
      }
    }
  }
  return "";
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid asset enrichment request." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const result = await service.from("studio_pathway_assets")
    .select("id,pathway_slug,studio,asset_type,title,status,source_type,content,storage_bucket,storage_path,public_url,prompt,metadata")
    .eq("id", parsed.data.assetId)
    .maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  const asset = result.data;
  const pathway = pathwayBySlug(asset.pathway_slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  let imageUrl = typeof asset.public_url === "string" && asset.public_url ? asset.public_url : null;
  if (!imageUrl && typeof asset.storage_bucket === "string" && typeof asset.storage_path === "string") {
    const signed = await service.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 15 * 60);
    if (!signed.error) imageUrl = signed.data.signedUrl;
  }
  if (!imageUrl) return NextResponse.json({ error: "Sol can enrich image-backed assets only right now." }, { status: 409 });

  const scripture = pathway.steps.slice(0, 10).map((step) => `${step.reference}: ${step.explanation}`).join("\n");
  const model = process.env.OPENAI_ASSET_METADATA_MODEL?.trim() || process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";
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
            "You are Sol, the digital asset librarian for Apostolic Guide.",
            "Analyze the supplied asset for DISCOVERY and ACCESSIBILITY metadata. Do not rewrite doctrine, invent claims, identify unknown people, or add visual details you cannot see.",
            "Return ONLY one valid JSON object with exactly these keys:",
            '{"suggestedTitle":"...","description":"...","altText":"...","tags":["..."],"confidence":0.0}',
            "Rules:",
            "- suggestedTitle: short, useful library title, max 90 characters.",
            "- description: 1-2 sentences describing what the asset is and what it is useful for.",
            "- altText: describe visible content plainly for accessibility. Do not begin with 'image of'.",
            "- tags: 5-12 concise search terms. Mix visual/format terms with Pathway subject and Scripture references only when supported by context.",
            "- confidence: 0 to 1 for the overall metadata suggestion.",
            "- No markdown or commentary outside the JSON."
          ].join("\n") }]
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: [
              `PATHWAY: ${pathway.title}`,
              `PATHWAY SUMMARY: ${pathway.summary}`,
              `ASSET TITLE: ${asset.title}`,
              `ASSET TYPE: ${asset.asset_type}`,
              `STUDIO: ${asset.studio}`,
              `STATUS: ${asset.status}`,
              `SOURCE: ${asset.source_type}`,
              asset.prompt ? `GENERATION PROMPT: ${asset.prompt}` : "",
              `SCRIPTURE CONTEXT:\n${scripture}`
            ].filter(Boolean).join("\n\n") },
            { type: "input_image", image_url: imageUrl, detail: "low" }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    return NextResponse.json({ error: `Sol metadata enrichment failed (${response.status}).`, detail: (await response.text().catch(() => "")).slice(0, 1200) }, { status: 502 });
  }

  try {
    const enrichment = parsePathwayAssetEnrichment(extractText(await response.json()));
    await service.rpc("record_studio_audit", {
      p_actor_user_id: access.user.id,
      p_action: "pathway_asset.enrich_suggest",
      p_resource_type: "pathway_asset",
      p_resource_id: asset.id,
      p_metadata: { pathwaySlug: asset.pathway_slug, model, confidence: enrichment.confidence }
    }).catch(() => null);
    return NextResponse.json({ enrichment, model });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sol metadata could not be parsed." }, { status: 502 });
  }
}

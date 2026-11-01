import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { privateBlobReadUrl } from "@/private-blob";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  action: z.enum(["generate", "check_theology"]),
  assetId: z.string().uuid(),
  pathwaySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  platform: z.enum(["instagram", "youtube"]),
  mediaFormat: z.enum(["image", "reel", "long_form"]),
  title: z.string().trim().max(180).default(""),
  brief: z.string().trim().max(3000).default(""),
  description: z.string().trim().max(5000).default(""),
  caption: z.string().trim().max(10000).default(""),
  altText: z.string().trim().max(500).default(""),
  hashtags: z.array(z.string().trim().max(80)).max(20).default([]),
  tags: z.array(z.string().trim().max(80)).max(40).default([]),
  internalTags: z.array(z.string().trim().max(80)).max(30).default([]),
  privacyStatus: z.enum(["private", "unlisted", "public"]).default("private")
});

const generatedSchema = z.object({
  title: z.string().trim().max(180),
  description: z.string().trim().max(5000),
  caption: z.string().trim().max(2200),
  altText: z.string().trim().max(500),
  hashtags: z.array(z.string().trim().min(1).max(80)).max(15),
  tags: z.array(z.string().trim().min(1).max(80)).max(30),
  internalTags: z.array(z.string().trim().min(1).max(80)).max(20)
});

const theologyReviewSchema = z.object({
  status: z.enum(["pass", "warning", "block"]),
  summary: z.string().trim().min(1).max(1200),
  issues: z.array(z.object({
    severity: z.enum(["warning", "block"]),
    claim: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(1000),
    scripture: z.array(z.string().trim().min(1).max(100)).max(8)
  })).max(8)
});

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
  if (start < 0 || end < start) throw new Error("Sol returned no JSON object.");
  return JSON.parse(clean.slice(start, end + 1)) as unknown;
}

function removeEmDash(value: string) {
  return value.replace(/\s*\u2014\s*/g, ", ");
}

function cleanStringList(value: string[], max: number) {
  return [...new Set(value.map((item) => removeEmDash(item).trim()).filter(Boolean))].slice(0, max);
}

function cleanGenerated(value: z.infer<typeof generatedSchema>) {
  return {
    title: removeEmDash(value.title),
    description: removeEmDash(value.description),
    caption: removeEmDash(value.caption),
    altText: removeEmDash(value.altText),
    hashtags: cleanStringList(value.hashtags, 15),
    tags: cleanStringList(value.tags, 30),
    internalTags: cleanStringList(value.internalTags, 20)
  };
}

function cleanReview(value: z.infer<typeof theologyReviewSchema>) {
  return {
    ...value,
    summary: removeEmDash(value.summary),
    issues: value.issues.map((issue) => ({
      ...issue,
      claim: removeEmDash(issue.claim),
      reason: removeEmDash(issue.reason),
      scripture: cleanStringList(issue.scripture, 8)
    }))
  };
}

async function loadAsset(assetId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase is not configured.");
  const result = await service.from("studio_pathway_assets")
    .select("id,title,storage_bucket,storage_path,metadata")
    .eq("id", assetId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function runSol(model: string, apiKey: string, developerText: string, userContent: Array<Record<string, unknown>>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      input: [
        { role: "developer", content: [{ type: "input_text", text: developerText }] },
        { role: "user", content: userContent }
      ]
    })
  });
  if (!response.ok) throw new Error(`Sol request failed (${response.status}).`);
  return extractJson(extractText(await response.json()));
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid Sol publishing request." }, { status: 400 });

  try {
    const pathway = pathwayBySlug(parsed.data.pathwaySlug);
    if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
    const asset = await loadAsset(parsed.data.assetId);
    if (!asset) return NextResponse.json({ error: "Uploaded media asset not found." }, { status: 404 });

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
    const model = process.env.OPENAI_PUBLISHING_MODEL?.trim() || process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";
    const scripture = pathway.steps.map((step) => `${step.reference}: ${step.explanation}`).join("\n");
    const copy = [
      `DESTINATION: ${parsed.data.platform}`,
      `MEDIA FORMAT: ${parsed.data.mediaFormat}`,
      `PATHWAY: ${pathway.title}`,
      `PATHWAY SUMMARY: ${pathway.summary}`,
      `USER BRIEF: ${parsed.data.brief || "No extra brief supplied."}`,
      `TITLE: ${parsed.data.title || asset.title}`,
      `DESCRIPTION: ${parsed.data.description || "None yet."}`,
      `CAPTION: ${parsed.data.caption || "None yet."}`,
      `SCRIPTURE CONTEXT:\n${scripture}`
    ].join("\n\n");
    const userContent: Array<Record<string, unknown>> = [{ type: "input_text", text: copy }];
    const metadata = record(asset.metadata);
    const mime = String(metadata.mimeType || metadata.mime || "").toLowerCase();
    if (mime.startsWith("image/") && asset.storage_bucket === "vercel_blob" && asset.storage_path) {
      userContent.push({ type: "input_image", image_url: await privateBlobReadUrl(asset.storage_path, 15 * 60 * 1000), detail: "low" });
    }

    if (parsed.data.action === "generate") {
      const developerText = [
        "You are Sol, Apostolic Guide's publishing editor.",
        "Create platform-ready publishing metadata from the user's brief, selected Pathway, supplied Scripture context, and visible image when provided.",
        "Stay inside the supplied Pathway doctrine and Scripture context. Do not invent quotations, claims, or Scripture references.",
        "Never use an em dash character in any writing. Use a comma, period, semicolon, colon, or parentheses instead.",
        "Keep internal library tags separate from public hashtags.",
        "For Instagram, prioritize a natural caption. For YouTube, prioritize a searchable title and useful description.",
        "Return ONLY valid JSON with exactly these keys:",
        '{"title":"","description":"","caption":"","altText":"","hashtags":[],"tags":[],"internalTags":[]}',
        "title max 100 chars for YouTube and 180 otherwise; description max 5000; caption max 2200; altText max 500.",
        "hashtags 3-10; tags are YouTube/search metadata without #; internalTags are library organization labels.",
        "No markdown outside the JSON."
      ].join("\n");
      const generated = generatedSchema.parse(await runSol(model, apiKey, developerText, userContent));
      return NextResponse.json({ generated: cleanGenerated(generated), model });
    }

    const developerText = [
      "You are Sol performing an Apostolic Guide theology check on publishing copy.",
      "The selected Pathway summary and supplied Scripture context are the controlling reference for this check.",
      "Evaluate only claims actually present in the title, description, caption, brief, or visible image text. Do not invent objections or add doctrine that is not in the supplied source.",
      "Mark status pass when there is no material doctrinal issue, warning when wording is ambiguous or outruns the supplied support, and block when a claim directly contradicts the supplied Pathway or Scripture context.",
      "Do not grade writing style. Do not invent Scripture references. If a concern cannot be grounded in the supplied Pathway or Scripture, do not present it as an error.",
      "Never use an em dash character in any writing. Use a comma, period, semicolon, colon, or parentheses instead.",
      "Return ONLY valid JSON with exactly this shape:",
      '{"status":"pass","summary":"","issues":[{"severity":"warning","claim":"","reason":"","scripture":[]}]}',
      "When status is pass, issues should be an empty array. Keep the summary concise and practical.",
      "No markdown outside the JSON."
    ].join("\n");
    const review = theologyReviewSchema.parse(await runSol(model, apiKey, developerText, userContent));
    return NextResponse.json({ review: cleanReview(review), model });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : "Sol publishing request failed." }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { pathwayBySlug } from "@/pathway-catalog";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * This endpoint accepts ONLY one of the twenty canonical pathway slugs.
 * It never accepts arbitrary prompts, source text, API credentials, or reviewer input.
 * Vercel's persisted Next data cache stores drafts for 30 days to limit repeated model calls.
 * AI output is expressly unapproved and must never replace canonical teaching.
 */
const stepOutput = z.object({
  title: z.string().min(1).max(400),
  explanation: z.string().min(10).max(6000),
  hook: z.string().min(5).max(6000),
});
const outputSchema = z.object({
  title: z.string().min(1).max(400),
  summary: z.string().min(1).max(2400),
  steps: z.array(stepOutput).min(5).max(7),
});
function extractResponseText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const response = value as Record<string, unknown>;
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  return response.output.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.map((part: unknown) => {
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      return record.type === "output_text" && typeof record.text === "string" ? record.text : "";
    });
  }).join("");
}
const generateCached = unstable_cache(async (slug: string) => {
  const pathway = pathwayBySlug(slug);
  if (!pathway) throw new Error("Unknown pathway");
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Translation service is not configured in this environment.");
  const model = process.env.OPENAI_EKEGUSII_MODEL?.trim() || "gpt-4.1";
  const input = JSON.stringify({
    title: pathway.title,
    summary: pathway.summary,
    steps: pathway.steps.map((step) => ({
      title: step.title, reference: step.reference,
      explanation: step.explanation, hook: step.hook ?? "",
    })),
  });
  const instructions = [
    "You are a fluent native Ekegusii (Gusii, language code guz) theological translator.",
    "Translate the supplied Apostolic Oneness teaching from English into natural Ekegusii.",
    "Return title, summary, and steps in exactly the same order and count as the English source.",
    "Do not invent Scripture quotations, change Scripture references, soften theological claims, or omit qualifications.",
    "Preserve the Apostolic Oneness interpretation and its boundaries, including real humanity of Jesus, divine identity, baptism, Holy Ghost, grace, and the distinction between textual claims and later theological conclusions.",
    "Produce the closest possible natural Ekegusii draft, NOT Swahili or English; mark an exceptionally uncertain technical theological term by keeping the English term in parentheses.",
    "Do not produce any Bible verses. The reviewer will consult the publisher's Ekegusii Bible independently.",
    "Never claim the translation is verified, reviewed, or approved.",
  ].join(" ");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(75000),
    body: JSON.stringify({
      model,
      instructions,
      input,
      max_output_tokens: 7000,
      text: { format: { type: "json_schema", name: "ekegusii_pathway_translation", strict: true, schema: {
        type: "object", additionalProperties: false,
        required: ["title", "summary", "steps"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          steps: { type: "array", items: { type: "object", additionalProperties: false,
            required: ["title", "explanation", "hook"],
            properties: { title: { type: "string" }, explanation: { type: "string" }, hook: { type: "string" } },
          } },
        },
      } } },
    }),
  });
  if (!response.ok) {
    // Never leak external provider response bodies, keys, or model account information.
    throw new Error("The translation provider could not complete this pathway.");
  }
  const raw = extractResponseText(await response.json());
  let parsed: z.infer<typeof outputSchema>;
  try { parsed = outputSchema.parse(JSON.parse(raw)); }
  catch { throw new Error("Translation returned an incomplete or invalid study."); }
  if (parsed.steps.length !== pathway.steps.length) throw new Error("Translation step count does not match source.");
  const indexedSteps: Record<string, { title: string; explanation: string; hook: string }> = {};
  parsed.steps.forEach((step, index) => { indexedSteps[String(index)] = step; });
  return { title: parsed.title, summary: parsed.summary, steps: indexedSteps };
}, ["ekegusii-translation-v1"], { revalidate: 2592000 });

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !pathwayBySlug(slug))
    return NextResponse.json({ error: "Unknown Pathway." }, { status: 404 });
  try {
    const draft = await generateCached(slug);
    return NextResponse.json({ language: "guz", approved: false, slug, draft }, {
      headers: { "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=86400" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Translation temporarily unavailable.";
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

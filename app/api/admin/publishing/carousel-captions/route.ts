import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { pathwayAutomationKeyword } from "@/pathway-automation-keywords";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(180).optional(),
  slides: z.number().int().min(1).max(10).default(8)
});

const slideCaptionSchema = z.object({
  index: z.number().int().min(1).max(10),
  title: z.string().max(120),
  caption: z.string().max(900),
  altText: z.string().max(500)
});
const outputSchema = z.object({
  keyword: z.string().max(20),
  masterCaption: z.string().max(2200),
  slides: z.array(slideCaptionSchema).min(1).max(10)
});

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["keyword", "masterCaption", "slides"],
  properties: {
    keyword: { type: "string", maxLength: 20 },
    masterCaption: { type: "string", maxLength: 2200 },
    slides: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "title", "caption", "altText"],
        properties: {
          index: { type: "integer", minimum: 1, maximum: 10 },
          title: { type: "string", maxLength: 120 },
          caption: { type: "string", maxLength: 900 },
          altText: { type: "string", maxLength: 500 }
        }
      }
    }
  }
} as const;

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

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid caption request." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
  const keyword = pathwayAutomationKeyword(pathway.slug, pathway.title);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";
  const slideCount = parsed.data.slides;
  const flow = [
    { index: 1, title: parsed.data.title || pathway.title, reference: "", explanation: pathway.summary },
    ...pathway.steps.map((step, index) => ({ index: index + 2, title: step.title, reference: step.reference, explanation: step.explanation }))
  ].slice(0, Math.max(1, slideCount - 1));
  while (flow.length < Math.max(1, slideCount - 1)) {
    flow.push({ index: flow.length + 1, title: pathway.title, reference: "", explanation: pathway.summary });
  }
  flow.push({ index: slideCount, title: "Continue the study", reference: "", explanation: `Invite the reader to open the ${pathway.title} Pathway and continue through the Scripture in context.` });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      text: { verbosity: "low", format: { type: "json_schema", name: "instagram_carousel_captions", strict: true, schema: RESPONSE_SCHEMA } },
      input: [
        { role: "developer", content: [{ type: "input_text", text: [
          "You write Instagram publishing copy for Apostolic Guide.",
          "Keep every claim Scripture-first, precise, concise, and consistent with the supplied Pathway.",
          `The automation keyword is ${keyword}. Do not invent or alter it.`,
          "Return one master Instagram caption for the whole carousel plus one slide-specific note and one accessibility alt text for each slide.",
          "Important platform rule: Instagram carousels have one public post caption. Slide-specific copy is for internal publishing notes, accessibility alt text, and later repurposing, not separate public captions.",
          "MASTER CAPTION: strong first sentence, short teaching summary, one clear CTA, then the exact automation instruction: Comment KEYWORD and I’ll send you the full study. Include the exact keyword. Keep hashtags restrained.",
          "SLIDE NOTE: 1–3 short sentences matching only that slide. Do not repeat the same wording across slides. End each note with a natural CTA using the same keyword only when it makes sense, but never change the keyword.",
          "ALT TEXT: describe the slide's visible teaching content for accessibility. Do not put hashtags, marketing language, or the automation keyword into alt text.",
          "Do not quote Scripture verbatim unless exact wording is supplied in the source. Use references and faithful paraphrase otherwise."
        ].join("\n") }] },
        { role: "user", content: [{ type: "input_text", text: [
          `PATHWAY: ${pathway.title}`,
          `SUMMARY: ${pathway.summary}`,
          `AUTOMATION KEYWORD: ${keyword}`,
          "SLIDE FLOW:",
          ...flow.map((slide) => `${slide.index}. ${slide.title}${slide.reference ? ` — ${slide.reference}` : ""}: ${slide.explanation}`)
        ].join("\n") }] }
      ]
    })
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 1200);
    return NextResponse.json({ error: `Caption generation failed (${response.status}).`, detail }, { status: 502 });
  }
  const result = await response.json();
  const text = extractResponseText(result);
  if (!text) return NextResponse.json({ error: "Caption generator returned no structured output." }, { status: 502 });
  try {
    const output = outputSchema.parse(JSON.parse(text));
    return NextResponse.json({ ...output, keyword, model });
  } catch {
    return NextResponse.json({ error: "Caption generator returned invalid structured output." }, { status: 502 });
  }
}

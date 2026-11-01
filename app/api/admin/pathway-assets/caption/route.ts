import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  pathwaySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  creationType: z.enum(["carousel","single-post","story","thumbnail","video"]),
  title: z.string().max(180).optional().default(""),
  prompt: z.string().max(4000).optional().default(""),
  slides: z.array(z.object({ title: z.string().max(220), body: z.string().max(600), reference: z.string().max(120).optional().default("") })).max(20).optional().default([]),
  ctaKeyword: z.string().max(30).optional().default("")
});

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["caption","shortCaption","storyCopy","altText","hook","cta"],
  properties: {
    caption: { type: "string", maxLength: 2200 },
    shortCaption: { type: "string", maxLength: 500 },
    storyCopy: { type: "string", maxLength: 500 },
    altText: { type: "string", maxLength: 500 },
    hook: { type: "string", maxLength: 180 },
    cta: { type: "string", maxLength: 240 }
  }
} as const;

function outputText(value: unknown) {
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid caption request." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.pathwaySlug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";

  const scriptureFlow = pathway.steps.map((step) => `${step.reference} — ${step.title}: ${step.explanation}`).join("\n");
  const assetCopy = parsed.data.slides.map((slide, index) => `${index + 1}. ${slide.title}\n${slide.body}\n${slide.reference}`).join("\n\n");
  const keyword = parsed.data.ctaKeyword.trim().toUpperCase();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      text: { verbosity: "low", format: { type: "json_schema", name: "ag_social_copy", strict: true, schema: RESPONSE_SCHEMA } },
      input: [
        { role: "developer", content: [{ type: "input_text", text: [
          "You write social copy for Apostolic Guide.",
          "Voice: Scripture-first, clear, confident, pastoral without sounding promotional or generic. Avoid hype, engagement bait, fake urgency, filler, em dashes, and repetitive sentence shapes.",
          "Keep doctrinal claims within the supplied Pathway. Do not invent verse wording or lexical/historical claims.",
          "The caption should add value rather than simply repeat the graphic. Use short paragraphs for mobile readability.",
          "For a carousel, let the caption push the reader into the sequence. For a single post, deepen the central statement. For a story, keep it conversational and compact. For a thumbnail/video, produce supporting launch copy.",
          keyword ? `When a comment-keyword CTA is appropriate, use exactly COMMENT \"${keyword}\" to receive the Pathway.` : "Do not invent a comment keyword.",
          "Alt text must describe the communication content plainly for accessibility."
        ].join("\n") }] },
        { role: "user", content: [{ type: "input_text", text: [
          `FORMAT: ${parsed.data.creationType}`,
          `PATHWAY: ${pathway.title}`,
          `SUMMARY: ${pathway.summary}`,
          `CREATIVE DIRECTION: ${parsed.data.prompt || "Use the current asset."}`,
          `ASSET TITLE: ${parsed.data.title || pathway.title}`,
          `ASSET COPY:\n${assetCopy || "No slide copy supplied."}`,
          `PATHWAY SCRIPTURE FLOW:\n${scriptureFlow}`
        ].join("\n\n") }] }
      ]
    })
  });
  if (!response.ok) return NextResponse.json({ error: `Sol caption generation failed (${response.status}).`, detail: (await response.text().catch(() => "")).slice(0, 1200) }, { status: 502 });
  const raw = outputText(await response.json());
  if (!raw) return NextResponse.json({ error: "Sol returned no caption." }, { status: 502 });
  try {
    return NextResponse.json({ copy: JSON.parse(raw), model });
  } catch {
    return NextResponse.json({ error: "Sol returned invalid caption data." }, { status: 502 });
  }
}

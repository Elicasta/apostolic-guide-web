import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { CAROUSEL_GENERATOR_RULES, MODE_STYLE_DEFAULTS } from "@/carousel-design-rules";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  mode: z.enum(["pathway", "informational", "word-study", "verse-connection", "app-guide"]),
  prompt: z.string().trim().min(3).max(4000),
  targetSlides: z.number().int().min(1).max(12).optional().default(8)
});

const slideSchema = z.object({
  kind: z.enum(["cover", "scripture", "statement", "connection", "cta"]),
  eyebrow: z.string().max(80),
  title: z.string().max(180),
  body: z.string().max(500),
  reference: z.string().max(100),
  secondaryReference: z.string().max(100),
  templateHint: z.enum(["standard", "verse-connection", "manifesto"])
});

const outputSchema = z.object({
  title: z.string().max(160),
  rationale: z.string().max(500),
  slides: z.array(slideSchema).min(1).max(12)
});

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "rationale", "slides"],
  properties: {
    title: { type: "string", maxLength: 160 },
    rationale: { type: "string", maxLength: 500 },
    slides: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "eyebrow", "title", "body", "reference", "secondaryReference", "templateHint"],
        properties: {
          kind: { type: "string", enum: ["cover", "scripture", "statement", "connection", "cta"] },
          eyebrow: { type: "string", maxLength: 80 },
          title: { type: "string", maxLength: 180 },
          body: { type: "string", maxLength: 500 },
          reference: { type: "string", maxLength: 100 },
          secondaryReference: { type: "string", maxLength: 100 },
          templateHint: { type: "string", enum: ["standard", "verse-connection", "manifesto"] }
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
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid carousel request." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";
  const pathway = parsed.data.slug ? pathwayBySlug(parsed.data.slug) : null;
  const pathwayContext = pathway ? [
    `PATHWAY: ${pathway.title}`,
    `SUMMARY: ${pathway.summary}`,
    "SCRIPTURE FLOW:",
    ...pathway.steps.map((step, index) => `${index + 1}. ${step.reference} — ${step.title}: ${step.explanation}`)
  ].join("\n") : "No Pathway source was selected.";

  const preferredStyle = MODE_STYLE_DEFAULTS[parsed.data.mode];
  const modeDirection = {
    pathway: "Write for Street Theology: direct, Scripture-forward, declarative, and easy to scan. Do not make every slide a slogan; evidence slides still need clear explanatory body copy.",
    informational: "Write for Brand White Editorial: calm, ordered teaching with restrained headlines and highly readable body copy.",
    "word-study": "Write for Brand White Editorial: scholarly but accessible. Keep lexical claims conservative and clearly separated from the biblical text itself.",
    "verse-connection": "Write for Verse Connection: make the paired passages and the relationship between them the visual and conceptual center of each connection slide.",
    "app-guide": "Write for Brand White Editorial: task-oriented, simple, sequential steps with one action per slide."
  }[parsed.data.mode];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      text: {
        verbosity: "low",
        format: { type: "json_schema", name: "apostolic_guide_carousel_plan", strict: true, schema: RESPONSE_SCHEMA }
      },
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: [
            "You are the content director for Apostolic Guide, a Scripture-first Apostolic Bible study platform.",
            "The final asset is a mobile social carousel. Write for deliberate learning, clarity, retention, and a clean sense of completion rather than sensationalism.",
            `This carousel type defaults to the ${preferredStyle} visual system. Shape the copy for that visual language.`,
            modeDirection,
            "DESIGN CONTRACT:",
            ...CAROUSEL_GENERATOR_RULES,
            "CONTENT RULES:",
            "Create concise social graphics, not sermon paragraphs. Each slide must read cleanly on a phone.",
            "Prefer one strong idea per slide. Keep display headlines short. If an idea needs many words, move detail into body copy and shorten the headline.",
            "Use body copy as a scannable explanation, not a second headline. Prefer roughly 1–3 short sentences and avoid dense blocks.",
            "Slide 1 is a hook and promise, not an explanation dump. Middle slides progress one point at a time. The final slide provides closure and one next action.",
            "Use repetition only when it strengthens the teaching thread. Avoid repetitive sentence shapes from slide to slide.",
            "Do not invent quotations, verse wording, lexical facts, Greek/Hebrew claims, historical claims, or doctrinal claims. When exact verse wording is not supplied, paraphrase and keep the reference.",
            "For word studies, distinguish the biblical text from lexical explanation. Use conservative transliteration/definition language and avoid claims based only on an English gloss.",
            "For verse connections, create paired-reference slides that make the relationship visually obvious and state the connection in one short line.",
            "For app-guide content, write task-oriented steps showing what a reader can do in Apostolic Guide. Do not claim a feature unless it is present in the provided source context.",
            "The renderer has three template hints: standard, verse-connection, manifesto. Use verse-connection only for paired passages. Use manifesto only for a genuinely short declarative belief or identity statement.",
            `Return about ${parsed.data.targetSlides} slides. Prefer 5–10 total slides unless the requested target requires otherwise.`,
            "Never make every slide a giant headline. Alternate hook, teaching, evidence, connection, recap, and CTA as the material requires."
          ].join("\n") }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: [
            `CAROUSEL TYPE: ${parsed.data.mode}`,
            `CREATIVE REQUEST: ${parsed.data.prompt}`,
            pathwayContext
          ].join("\n\n") }]
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 1200);
    return NextResponse.json({ error: `Carousel planning failed (${response.status}).`, detail }, { status: 502 });
  }

  const result = await response.json();
  const outputText = extractResponseText(result);
  if (!outputText) return NextResponse.json({ error: "Carousel planner returned no structured output." }, { status: 502 });

  try {
    const output = outputSchema.parse(JSON.parse(outputText));
    return NextResponse.json({ plan: output, model, preferredStyle });
  } catch {
    return NextResponse.json({ error: "Carousel planner returned invalid structured output." }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const layoutSchema = z.object({
  copyY: z.number().min(25).max(72),
  headlineScale: z.number().min(0.55).max(1.2),
  bodyScale: z.number().min(0.7).max(1.2),
  bodyWidth: z.number().min(48).max(92),
  crownScale: z.number().min(0.5).max(1.35),
  slashY: z.number().min(8).max(78),
  slashWidth: z.number().min(18).max(82),
  align: z.enum(["left", "center", "right"]),
  titleWidth: z.number().min(54).max(96)
});

const requestSchema = z.object({
  instruction: z.string().trim().min(2).max(1500),
  slide: z.object({
    kind: z.string().max(40),
    eyebrow: z.string().max(100),
    title: z.string().max(220),
    body: z.string().max(700),
    reference: z.string().max(120),
    secondaryReference: z.string().max(120).optional().default("")
  }),
  layout: layoutSchema
});

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["copyY", "headlineScale", "bodyScale", "bodyWidth", "crownScale", "slashY", "slashWidth", "align", "titleWidth", "summary"],
  properties: {
    copyY: { type: "number", minimum: 25, maximum: 72 },
    headlineScale: { type: "number", minimum: 0.55, maximum: 1.2 },
    bodyScale: { type: "number", minimum: 0.7, maximum: 1.2 },
    bodyWidth: { type: "number", minimum: 48, maximum: 92 },
    crownScale: { type: "number", minimum: 0.5, maximum: 1.35 },
    slashY: { type: "number", minimum: 8, maximum: 78 },
    slashWidth: { type: "number", minimum: 18, maximum: 82 },
    align: { type: "string", enum: ["left", "center", "right"] },
    titleWidth: { type: "number", minimum: 54, maximum: 96 },
    summary: { type: "string", maxLength: 180 }
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid layout adjustment request." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      text: { verbosity: "low", format: { type: "json_schema", name: "apostolic_guide_layout_adjustment", strict: true, schema: RESPONSE_SCHEMA } },
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: [
            "You translate a creative director's natural-language request into bounded layout controls for an Apostolic Guide social graphic.",
            "Change only what the instruction implies. Preserve readability, safe margins, visual hierarchy, and phone legibility.",
            "Long headlines should get smaller, wider, or repositioned rather than stacking into an oversized wall of text.",
            "copyY is the vertical center percentage. headlineScale/bodyScale are multipliers. bodyWidth/titleWidth are percentages. slashY is percent from top. slashWidth is percent. crownScale is a multiplier.",
            "Do not alter copy. Do not return CSS, pixels, prose instructions, or values outside the schema."
          ].join("\n") }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(parsed.data) }]
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 1000);
    return NextResponse.json({ error: `Layout adjustment failed (${response.status}).`, detail }, { status: 502 });
  }

  const result = await response.json();
  const outputText = extractResponseText(result);
  if (!outputText) return NextResponse.json({ error: "Layout director returned no structured output." }, { status: 502 });

  try {
    const raw = JSON.parse(outputText) as Record<string, unknown>;
    const summary = typeof raw.summary === "string" ? raw.summary : "Layout adjusted.";
    const layout = layoutSchema.parse(raw);
    return NextResponse.json({ layout, summary, model });
  } catch {
    return NextResponse.json({ error: "Layout director returned invalid structured output." }, { status: 502 });
  }
}

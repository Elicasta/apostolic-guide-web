import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  style: z.enum(["street", "editorial", "cinematic", "verse", "manifesto"]),
  kind: z.enum(["cover", "scripture", "statement", "connection", "cta"]).catch("statement"),
  title: z.string().max(300).optional().default(""),
  body: z.string().max(1200).optional().default(""),
  reference: z.string().max(160).optional().default(""),
  secondaryReference: z.string().max(160).optional().default(""),
  slideNumber: z.number().int().min(1).max(20).optional().default(1),
  totalSlides: z.number().int().min(1).max(20).optional().default(1)
});

const outputSchema = z.object({
  mode: z.enum(["texture", "image", "none"]),
  reason: z.string().max(320),
  prompt: z.string().max(1200),
  overlay: z.number().int().min(20).max(75)
});

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mode", "reason", "prompt", "overlay"],
  properties: {
    mode: { type: "string", enum: ["texture", "image", "none"] },
    reason: { type: "string", maxLength: 320 },
    prompt: { type: "string", maxLength: 1200 },
    overlay: { type: "integer", minimum: 20, maximum: 75 }
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid background-direction request." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";
  const data = parsed.data;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      text: {
        verbosity: "low",
        format: { type: "json_schema", name: "carousel_background_direction", strict: true, schema: RESPONSE_SCHEMA }
      },
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: [
            "You are the background art director for Apostolic Guide social graphics.",
            "Decide whether the CURRENT SLIDE should use a reusable texture, a generated background image, or a clean surface with no texture/image.",
            "The goal is a 90%-ready social graphic with high readability, not decorative novelty.",
            "Prefer TEXTURE for verse connections, word-study/evidence material, Scripture-heavy teaching, and slides with medium or high copy density.",
            "Prefer IMAGE for covers, cinematic/story moments, low-copy statements, app/tutorial moments that benefit from visual context, and occasional emotional/scene-setting slides.",
            "Prefer NONE for highly restrained light editorial slides where whitespace is the visual strategy.",
            "Do not recommend an image merely because it is possible. A carousel should not become visually noisy.",
            "Generated imagery must NEVER contain text, Scripture wording, logos, typography, crowns, watermarks, UI screenshots, or fake app interfaces.",
            "If mode=image, write a production-ready image prompt that leaves intentional negative space for overlaid HTML text and uses Apostolic Guide color atmosphere: deep navy/ink, warm brand white, restrained crimson, restrained teal-blue. Never orange or neon.",
            "The image prompt should describe visual substrate only: photography, environment, objects, atmosphere, texture, lighting, framing, and safe copy space.",
            "Overlay is the recommended dark readability overlay percent when an image is used. Use roughly 35-60 in most cases.",
            "For mode=texture or none, prompt may be an empty string."
          ].join("\n") }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: [
            `STYLE: ${data.style}`,
            `SLIDE KIND: ${data.kind}`,
            `POSITION: ${data.slideNumber} of ${data.totalSlides}`,
            `TITLE: ${data.title || "(none)"}`,
            `BODY: ${data.body || "(none)"}`,
            `REFERENCE: ${data.reference || "(none)"}`,
            `SECOND REFERENCE: ${data.secondaryReference || "(none)"}`
          ].join("\n") }]
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 1200);
    return NextResponse.json({ error: `Background direction failed (${response.status}).`, detail }, { status: 502 });
  }

  const result = await response.json();
  const outputText = extractResponseText(result);
  if (!outputText) return NextResponse.json({ error: "Background director returned no structured output." }, { status: 502 });

  try {
    const direction = outputSchema.parse(JSON.parse(outputText));
    return NextResponse.json({ direction, model });
  } catch {
    return NextResponse.json({ error: "Background director returned invalid structured output." }, { status: 502 });
  }
}

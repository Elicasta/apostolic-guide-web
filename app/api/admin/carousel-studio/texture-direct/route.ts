import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { CAROUSEL_TEXTURES, type CarouselTextureId } from "@/carousel-design-rules";

export const runtime = "nodejs";
export const maxDuration = 60;

const textureIds = CAROUSEL_TEXTURES.map((texture) => texture.id) as [CarouselTextureId, ...CarouselTextureId[]];

const requestSchema = z.object({
  style: z.enum(["street", "editorial", "cinematic", "verse", "manifesto"]),
  title: z.string().max(240).optional().default(""),
  body: z.string().max(800).optional().default(""),
  instruction: z.string().trim().max(1200).optional().default("")
});

const outputSchema = z.object({
  texture: z.enum(textureIds),
  strength: z.number().int().min(0).max(70),
  rationale: z.string().max(280)
});

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["texture", "strength", "rationale"],
  properties: {
    texture: { type: "string", enum: textureIds },
    strength: { type: "integer", minimum: 0, maximum: 70 },
    rationale: { type: "string", maxLength: 280 }
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid texture request." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";

  const library = CAROUSEL_TEXTURES.map((texture) => `${texture.id}: ${texture.description} Best for ${texture.bestFor.join(", ")}. Default strength ${texture.defaultStrength}.`).join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      text: {
        verbosity: "low",
        format: { type: "json_schema", name: "carousel_texture_direction", strict: true, schema: RESPONSE_SCHEMA }
      },
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: [
            "You are the texture and surface art director for Apostolic Guide social graphics.",
            "Choose one texture from the approved library. Do not invent a texture id.",
            "Texture is subordinate to the message. It must add atmosphere or structure without reducing readability.",
            "Prefer subtle strengths. Heavy texture is only appropriate for very short declarative slides.",
            "Brand palette is locked: ink #10202a, paper #f5f7f4, crimson #a12d3d, blue #15566a, blue-soft #dcebee. Do not introduce orange, neon, or unrelated colors.",
            "For editorial and verse layouts, prefer tactile paper and print textures. For street layouts, prefer controlled grit/concrete. For cinematic, prefer fog/grit/light leak. For manifesto, prefer sparse dust/grit.",
            "If the user asks for something that would make text harder to read, choose a restrained approximation instead.",
            "APPROVED LIBRARY:",
            library
          ].join("\n") }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: [
            `STYLE: ${parsed.data.style}`,
            `HEADLINE: ${parsed.data.title || "(none)"}`,
            `BODY: ${parsed.data.body || "(none)"}`,
            `DIRECTION: ${parsed.data.instruction || "Choose the most fitting restrained texture."}`
          ].join("\n") }]
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 1000);
    return NextResponse.json({ error: `Texture direction failed (${response.status}).`, detail }, { status: 502 });
  }

  const result = await response.json();
  const outputText = extractResponseText(result);
  if (!outputText) return NextResponse.json({ error: "Texture director returned no structured output." }, { status: 502 });

  try {
    const direction = outputSchema.parse(JSON.parse(outputText));
    return NextResponse.json({ direction, model });
  } catch {
    return NextResponse.json({ error: "Texture director returned invalid structured output." }, { status: 502 });
  }
}

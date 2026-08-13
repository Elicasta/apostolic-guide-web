import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  style: z.enum(["street", "editorial", "cinematic", "verse", "manifesto"]),
  prompt: z.string().trim().min(8).max(1800),
  orientation: z.enum(["portrait", "landscape"]).optional().default("portrait")
});

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid background-image request." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1.5";
  const size = parsed.data.orientation === "landscape" ? "1536x1024" : "1024x1536";

  const prompt = [
    "Create a premium text-free background image for an Apostolic Guide social graphic.",
    `VISUAL FAMILY: ${parsed.data.style}.`,
    "The image is only the visual substrate. Do not render words, letters, numbers, Scripture quotations, logos, symbols that look like a logo, crowns, watermarks, UI, posters, signs, book text, or typography of any kind.",
    "Leave a generous uncluttered negative-space region suitable for exact HTML/CSS typography to be placed later.",
    "Apostolic Guide atmosphere: deep navy/ink, warm brand white, restrained crimson, restrained teal-blue. Do not use orange, neon colors, rainbow grading, or glossy corporate gradients.",
    "Keep visual detail away from the copy-safe area. Avoid busy central texture and avoid faces unless the prompt clearly requires a human subject.",
    parsed.data.prompt
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      size,
      quality: "low",
      output_format: "webp"
    })
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 1200);
    return NextResponse.json({ error: `Background image generation failed (${response.status}).`, detail }, { status: 502 });
  }

  const result = await response.json() as { data?: Array<{ b64_json?: string }> };
  const base64 = result.data?.[0]?.b64_json;
  if (!base64) return NextResponse.json({ error: "Image generator returned no image data." }, { status: 502 });

  return NextResponse.json({ dataUrl: `data:image/webp;base64,${base64}`, model, size });
}

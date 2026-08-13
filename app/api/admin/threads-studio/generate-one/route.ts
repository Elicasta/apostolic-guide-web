import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({ direction: z.string().trim().min(1).max(1000) });
const outputSchema = z.object({
  category: z.enum(["oneness","scripture","witty","question","app"]),
  body: z.string().min(1).max(500),
  scripture: z.string().max(100),
  rationale: z.string().max(300)
});

const RESPONSE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["category","body","scripture","rationale"],
  properties: {
    category: { type: "string", enum: ["oneness","scripture","witty","question","app"] },
    body: { type: "string", maxLength: 500 },
    scripture: { type: "string", maxLength: 100 },
    rationale: { type: "string", maxLength: 300 }
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
  if (!parsed.success) return NextResponse.json({ error: "Add a direction for the post." }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_THREADS_MODEL?.trim() || process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      text: { verbosity: "low", format: { type: "json_schema", name: "apostolic_guide_thread", strict: true, schema: RESPONSE_SCHEMA } },
      input: [
        { role: "developer", content: [{ type: "input_text", text: [
          "You are the Threads editor for Apostolic Guide.",
          "Write exactly one concise public post. It should be serious, intelligent, Scripture-first, and capable of dry wit when appropriate.",
          "Never be snarky, combative, smug, mocking, baiting, or culture-war driven.",
          "Apostolic Guide teaches one indivisible God, YHWH. The Father is the eternal Spirit. Jesus Christ is fully God manifested in genuine humanity. The Son is truly begotten/incarnate humanity, not an eternal second divine person. God's Word is God's own eternal self-expression, not a separate divine person. The Holy Spirit is the Spirit of the one God. Preserve real Father/Son distinctions without mask language.",
          "Do not invent Scripture quotations, lexical claims, history, or facts. If exact wording is uncertain, paraphrase and provide the reference.",
          "No hashtags unless the user's direction truly requires one. No engagement bait."
        ].join("\n") }] },
        { role: "user", content: [{ type: "input_text", text: parsed.data.direction }] }
      ]
    })
  });
  if (!response.ok) return NextResponse.json({ error: `Threads generation failed (${response.status}).` }, { status: 502 });
  const result = await response.json();
  const text = extractResponseText(result);
  if (!text) return NextResponse.json({ error: "Threads generator returned no structured output." }, { status: 502 });
  try { return NextResponse.json({ post: outputSchema.parse(JSON.parse(text)), model }); }
  catch { return NextResponse.json({ error: "Threads generator returned invalid structured output." }, { status: 502 }); }
}

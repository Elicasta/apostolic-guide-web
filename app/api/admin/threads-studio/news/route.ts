import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  focus: z.string().trim().max(500).optional().default("major humanitarian events, natural disasters, public tragedies, and situations where a brief prayerful response would be appropriate"),
  count: z.number().int().min(1).max(5).optional().default(3)
});

const RESPONSE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["items"],
  properties: {
    items: { type: "array", minItems: 0, maxItems: 5, items: {
      type: "object", additionalProperties: false,
      required: ["headline","eventSummary","sourceTitle","sourceUrl","draft","whyAppropriate"],
      properties: {
        headline: { type: "string", maxLength: 180 },
        eventSummary: { type: "string", maxLength: 500 },
        sourceTitle: { type: "string", maxLength: 220 },
        sourceUrl: { type: "string", maxLength: 1000 },
        draft: { type: "string", maxLength: 500 },
        whyAppropriate: { type: "string", maxLength: 300 }
      }
    }}
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid news scan request." }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_THREADS_MODEL?.trim() || "gpt-5.6-sol";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      tools: [{ type: "web_search" }],
      text: { verbosity: "low", format: { type: "json_schema", name: "apostolic_guide_prayer_news", strict: true, schema: RESPONSE_SCHEMA } },
      input: [
        { role: "developer", content: [{ type: "input_text", text: [
          "Find only recent, well-sourced events where a church/ministry account could responsibly offer prayer, compassion, or support.",
          "Prefer major humanitarian events, natural disasters, loss of life, displacement, or broadly relevant public tragedy. Avoid partisan commentary, rumor, outrage bait, celebrity gossip, and speculative breaking news.",
          "Use reputable primary authorities or major established news organizations. Return a direct source URL for every item.",
          "Draft a short Apostolic Guide Threads post that is compassionate, sober, non-exploitative, and prayerful. Do not force theology into tragedy. Do not assign blame. Do not imply facts beyond the source.",
          "If there is nothing appropriate enough to post, return an empty list.",
          `Return at most ${parsed.data.count} items.`
        ].join("\n") }] },
        { role: "user", content: [{ type: "input_text", text: `SCAN FOCUS: ${parsed.data.focus}` }] }
      ]
    })
  });
  if (!response.ok) return NextResponse.json({ error: `News scan failed (${response.status}).`, detail: (await response.text().catch(() => "")).slice(0,1200) }, { status: 502 });
  const result = await response.json();
  const text = extractResponseText(result);
  if (!text) return NextResponse.json({ error: "News scan returned no structured output." }, { status: 502 });
  try { return NextResponse.json({ ...JSON.parse(text), model }); }
  catch { return NextResponse.json({ error: "News scan returned invalid structured output." }, { status: 502 }); }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";

export const runtime = "nodejs";
export const maxDuration = 90;

const schema = z.object({
  headline: z.string().trim().min(3).max(220),
  eventSummary: z.string().trim().max(1200).optional().default(""),
  sourceTitle: z.string().trim().min(2).max(220),
  sourceUrl: z.string().url().max(1200),
  direction: z.string().trim().max(600).optional().default("")
});

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["draft", "whyAppropriate"],
  properties: {
    draft: { type: "string", maxLength: 500 },
    whyAppropriate: { type: "string", maxLength: 320 }
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
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid source." }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_THREADS_MODEL?.trim() || "gpt-5.6-sol";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      text: { verbosity: "low", format: { type: "json_schema", name: "apostolic_guide_prayer_thread", strict: true, schema: OUTPUT_SCHEMA } },
      input: [
        { role: "developer", content: [{ type: "input_text", text: [
          "You are drafting one short Threads post for Apostolic Guide from a news source that the editor already selected.",
          "Do not browse the web. Do not add facts, names, casualty counts, motives, blame, or political interpretation that are not supplied below.",
          "The voice should be Christian, compassionate, sober, prayerful, and non-exploitative.",
          "Do not force a doctrinal lesson into tragedy. Do not use the event as clickbait. Do not claim God caused the event or explain why it happened.",
          "When the supplied source detail is thin, keep the post general rather than filling gaps.",
          "Keep the draft suitable for Threads and normally under 350 characters."
        ].join("\n") }] },
        { role: "user", content: [{ type: "input_text", text: [
          `SOURCE: ${parsed.data.sourceTitle}`,
          `HEADLINE: ${parsed.data.headline}`,
          `SOURCE URL: ${parsed.data.sourceUrl}`,
          `SOURCE SUMMARY: ${parsed.data.eventSummary || "No additional summary supplied. Review the linked source for full context."}`,
          parsed.data.direction ? `EDITOR DIRECTION: ${parsed.data.direction}` : ""
        ].filter(Boolean).join("\n") }] }
      ]
    })
  });
  if (!response.ok) return NextResponse.json({ error: `Prayer draft failed (${response.status}).`, detail: (await response.text().catch(() => "")).slice(0, 1000) }, { status: 502 });
  const text = extractResponseText(await response.json());
  if (!text) return NextResponse.json({ error: "Prayer draft returned no structured output." }, { status: 502 });
  try { return NextResponse.json({ ...JSON.parse(text), model }); }
  catch { return NextResponse.json({ error: "Prayer draft returned invalid structured output." }, { status: 502 }); }
}

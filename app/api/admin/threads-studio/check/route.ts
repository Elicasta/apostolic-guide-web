import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  batchId: z.string().uuid().optional(),
  posts: z.array(z.object({ id: z.string().optional(), body: z.string().min(1).max(1000), category: z.string().max(40) })).min(1).max(30)
});

const RESPONSE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["status","summary","posts"],
  properties: {
    status: { type: "string", enum: ["pass","warning","blocked"] },
    summary: { type: "string", maxLength: 500 },
    posts: { type: "array", maxItems: 30, items: {
      type: "object", additionalProperties: false,
      required: ["index","status","notes","suggestion"],
      properties: {
        index: { type: "integer", minimum: 0, maximum: 29 },
        status: { type: "string", enum: ["pass","warning","blocked"] },
        notes: { type: "string", maxLength: 500 },
        suggestion: { type: "string", maxLength: 500 }
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid Threads review request." }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_SCRIPT_CHECK_MODEL?.trim() || process.env.OPENAI_THREADS_MODEL?.trim() || "gpt-5.6-sol";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      text: { verbosity: "low", format: { type: "json_schema", name: "apostolic_guide_threads_doctrine_check", strict: true, schema: RESPONSE_SCHEMA } },
      input: [
        { role: "developer", content: [{ type: "input_text", text: [
          "You are the Apostolic Guide public-post theology checker.",
          "Apostolic Guide teaches one indivisible God, YHWH. The Father is the eternal Spirit. Jesus Christ is fully God manifested in genuine humanity. The Son is truly begotten/incarnate humanity, not an eternal second divine person. God's Word is God's own eternal self-expression, not a separate divine person. The Holy Spirit is the Spirit of the one God. Preserve real Father/Son distinctions without mask language.",
          "Check Scripture fidelity, factual restraint, clarity, tone, and whether humor remains respectful.",
          "Block direct doctrinal contradiction, false quotation, fabricated lexical/historical claims, or materially misleading statements.",
          "Warn on overstatement, wording likely to confuse, proof-texting without enough context, or jokes that sound combative or dismissive.",
          "Prayer/news posts should express compassion and prayer without exploiting suffering, assigning blame, or making unverified factual claims.",
          "If a post is faithful and responsible, mark pass. Do not manufacture issues."
        ].join("\n") }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(parsed.data.posts) }] }
      ]
    })
  });
  if (!response.ok) return NextResponse.json({ error: `Threads doctrine check failed (${response.status}).`, detail: (await response.text().catch(() => "")).slice(0,1200) }, { status: 502 });
  const result = await response.json();
  const text = extractResponseText(result);
  if (!text) return NextResponse.json({ error: "Threads doctrine checker returned no structured output." }, { status: 502 });
  let review: { status: "pass"|"warning"|"blocked"; summary: string; posts: Array<{index:number;status:"pass"|"warning"|"blocked";notes:string;suggestion:string}> };
  try { review = JSON.parse(text); }
  catch { return NextResponse.json({ error: "Threads doctrine checker returned invalid structured output." }, { status: 502 }); }

  const service = createServiceClient();
  if (service && parsed.data.batchId) {
    await service.from("studio_threads_batches").update({ doctrine_status: review.status, doctrine_summary: review.summary, status: review.status === "blocked" ? "draft" : "reviewed", updated_at: new Date().toISOString() }).eq("id", parsed.data.batchId);
    await Promise.all(review.posts.map((item) => {
      const source = parsed.data.posts[item.index];
      if (!source?.id) return Promise.resolve({ error: null });
      return service.from("studio_threads_posts").update({ doctrine_status: item.status, doctrine_notes: item.notes, updated_at: new Date().toISOString() }).eq("id", source.id);
    }));
  }
  return NextResponse.json({ review, model });
}

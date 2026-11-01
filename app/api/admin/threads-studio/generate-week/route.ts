import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topic: z.string().trim().max(1000).optional().default("Oneness theology, Jesus Christ, Scripture, and practical Apostolic Bible study"),
  count: z.number().int().min(3).max(21).optional().default(10)
});

const postSchema = z.object({
  category: z.enum(["oneness","scripture","witty","question","app"]),
  body: z.string().min(1).max(500),
  rationale: z.string().max(300),
  scripture: z.string().max(100)
});

const outputSchema = z.object({
  title: z.string().max(120),
  strategy: z.string().max(600),
  posts: z.array(postSchema).min(3).max(21)
});

const RESPONSE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["title","strategy","posts"],
  properties: {
    title: { type: "string", maxLength: 120 },
    strategy: { type: "string", maxLength: 600 },
    posts: { type: "array", minItems: 3, maxItems: 21, items: {
      type: "object", additionalProperties: false,
      required: ["category","body","rationale","scripture"],
      properties: {
        category: { type: "string", enum: ["oneness","scripture","witty","question","app"] },
        body: { type: "string", maxLength: 500 },
        rationale: { type: "string", maxLength: 300 },
        scripture: { type: "string", maxLength: 100 }
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid Threads planning request." }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_THREADS_MODEL?.trim() || process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      text: { verbosity: "low", format: { type: "json_schema", name: "apostolic_guide_threads_week", strict: true, schema: RESPONSE_SCHEMA } },
      input: [
        { role: "developer", content: [{ type: "input_text", text: [
          "You are the Threads editor for Apostolic Guide.",
          "Write serious but witty short posts about Oneness theology, Scripture, Jesus Christ, and Apostolic Bible study.",
          "Voice: intelligent, restrained, dry humor when useful, never snarky, combative, smug, mocking, baiting, or culture-war driven.",
          "Apostolic Guide teaches one indivisible God, YHWH. The Father is the eternal Spirit. Jesus Christ is fully God manifested in genuine humanity. The Son is truly begotten/incarnate humanity, not an eternal second divine person. God's Word is God's own eternal self-expression, not a separate divine person. The Holy Spirit is the Spirit of the one God. Preserve real Father/Son distinctions without mask language.",
          "Posts should feel like thoughtful observations, short Scripture connections, memorable questions, or concise teaching. Avoid repetitive slogans.",
          "Do not invent quotations, verse wording, lexical facts, historical claims, or claims stronger than the text supports.",
          "Use exact Scripture quotations only when you are certain of the wording; otherwise paraphrase and include the reference.",
          "No hashtags unless truly useful. No engagement bait. No 'hot take' language. No fake certainty about disputed current events.",
          "Target a healthy weekly mix: theology, Scripture observation, one or two dry/witty observations, thoughtful questions, and occasional product/app education.",
          `Return exactly ${parsed.data.count} posts.`
        ].join("\n") }] },
        { role: "user", content: [{ type: "input_text", text: `WEEK START: ${parsed.data.weekStart}\nFOCUS: ${parsed.data.topic}` }] }
      ]
    })
  });
  if (!response.ok) return NextResponse.json({ error: `Threads planner failed (${response.status}).`, detail: (await response.text().catch(() => "")).slice(0,1200) }, { status: 502 });
  const result = await response.json();
  const text = extractResponseText(result);
  if (!text) return NextResponse.json({ error: "Threads planner returned no structured output." }, { status: 502 });
  let output: z.infer<typeof outputSchema>;
  try { output = outputSchema.parse(JSON.parse(text)); }
  catch { return NextResponse.json({ error: "Threads planner returned invalid structured output." }, { status: 502 }); }

  const service = createServiceClient();
  if (!service) return NextResponse.json({ plan: output, model, persisted: false });
  const batch = await service.from("studio_threads_batches").insert({ week_start: parsed.data.weekStart, topic: parsed.data.topic, voice: "serious-witty", status: "draft", metadata: { strategy: output.strategy, model } }).select("id,week_start,status").single();
  if (batch.error) return NextResponse.json({ error: batch.error.message }, { status: 500 });
  const rows = output.posts.map((post, index) => ({ batch_id: batch.data.id, position: index + 1, category: post.category, body: post.body, status: "draft", metadata: { rationale: post.rationale, scripture: post.scripture } }));
  const inserted = await service.from("studio_threads_posts").insert(rows).select("*").order("position");
  if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
  return NextResponse.json({ batch: batch.data, plan: output, posts: inserted.data ?? [], model, persisted: true });
}

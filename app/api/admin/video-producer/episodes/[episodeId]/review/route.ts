import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";
import { buildEpisodeReviewPrompt, episodeSpeakerSchema, EPISODE_FORMATS, reviewEpisodeScript } from "@/video-producer-episode-script";

const schema = z.object({ approve: z.boolean().optional().default(false) });

function sourceFor(slugs: string[]) {
  return slugs.flatMap((slug) => {
    const pathway = pathwayBySlug(slug);
    if (!pathway) return [];
    return [[`PATHWAY: ${pathway.title}`, `SUMMARY: ${pathway.summary}`, ...pathway.steps.map((step, index) => `${index + 1}. ${step.reference} — ${step.title}: ${step.explanation}`)].join("\n")];
  }).join("\n\n");
}

export async function POST(request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid review request." }, { status: 400 });
  const { episodeId } = await context.params;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const result = await service.from("video_producer_episode_scripts").select("*").eq("id", episodeId).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Episode was not found." }, { status: 404 });
  const row = result.data as Record<string, unknown>;
  const scriptText = String(row.script_text || "").trim();
  if (!scriptText) return NextResponse.json({ error: "Generate or write the episode script before theology review." }, { status: 409 });
  const format = typeof row.format === "string" && EPISODE_FORMATS.includes(row.format as typeof EPISODE_FORMATS[number]) ? row.format as typeof EPISODE_FORMATS[number] : "solo";
  const speakers = Array.isArray(row.speakers) ? row.speakers.flatMap((value) => { const check = episodeSpeakerSchema.safeParse(value); return check.success ? [check.data] : []; }) : [];
  const slugs = [String(row.primary_pathway_slug || ""), ...(Array.isArray(row.supporting_pathway_slugs) ? row.supporting_pathway_slugs.map(String) : [])].filter(Boolean);
  const pathwaySource = sourceFor(slugs);
  if (!pathwaySource) return NextResponse.json({ error: "Episode Pathway source could not be built." }, { status: 409 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });

  try {
    const model = process.env.OPENAI_EPISODE_REVIEW_MODEL?.trim() || process.env.OPENAI_EPISODE_MODEL?.trim() || "gpt-5.6-sol";
    const review = await reviewEpisodeScript({ apiKey, model, prompt: buildEpisodeReviewPrompt({ premise: String(row.premise || ""), format, speakers, pathwaySource, scriptText }) });
    const canApprove = review.verdict === "passed";
    if (parsed.data.approve && !canApprove) return NextResponse.json({ error: "Episode cannot be approved while theology review needs attention.", review }, { status: 409 });
    const status = parsed.data.approve ? "approved" : canApprove ? "draft" : "needs_review";
    const saved = await service.from("video_producer_episode_scripts").update({
      theology_review: { ...review, model, checkedAt: new Date().toISOString() },
      status,
      approved_at: parsed.data.approve ? new Date().toISOString() : null,
      updated_by: access.user.id
    }).eq("id", episodeId).select("*").single();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    return NextResponse.json({ episode: saved.data, review, canApprove });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Episode theology review failed." }, { status: 502 });
  }
}

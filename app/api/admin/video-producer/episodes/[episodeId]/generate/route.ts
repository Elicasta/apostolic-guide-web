import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";
import { buildEpisodeGenerationPrompt, episodeSpeakerSchema, generateEpisodeScript, EPISODE_FORMATS } from "@/video-producer-episode-script";

function sourceFor(slugs: string[]) {
  return slugs.flatMap((slug) => {
    const pathway = pathwayBySlug(slug);
    if (!pathway) return [];
    return [[`PATHWAY: ${pathway.title}`, `SUMMARY: ${pathway.summary}`, ...pathway.steps.map((step, index) => `${index + 1}. ${step.reference} — ${step.title}: ${step.explanation}`)].join("\n")];
  }).join("\n\n");
}

export async function POST(_request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const { episodeId } = await context.params;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const result = await service.from("video_producer_episode_scripts").select("*").eq("id", episodeId).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Episode was not found." }, { status: 404 });
  const row = result.data as Record<string, unknown>;
  const format = typeof row.format === "string" && EPISODE_FORMATS.includes(row.format as typeof EPISODE_FORMATS[number]) ? row.format as typeof EPISODE_FORMATS[number] : "solo";
  const speakers = Array.isArray(row.speakers) ? row.speakers.flatMap((value) => { const parsed = episodeSpeakerSchema.safeParse(value); return parsed.success ? [parsed.data] : []; }) : [];
  if (!speakers.length) return NextResponse.json({ error: "Add at least one speaker before generating." }, { status: 409 });
  const slugs = [String(row.primary_pathway_slug || ""), ...(Array.isArray(row.supporting_pathway_slugs) ? row.supporting_pathway_slugs.map(String) : [])].filter(Boolean);
  const pathwaySource = sourceFor(slugs);
  if (!pathwaySource) return NextResponse.json({ error: "Episode Pathway source could not be built." }, { status: 409 });

  try {
    const model = process.env.OPENAI_EPISODE_MODEL?.trim() || "gpt-5.6-sol";
    const script = await generateEpisodeScript({ apiKey, model, prompt: buildEpisodeGenerationPrompt({ title: String(row.title || "Untitled episode"), premise: String(row.premise || ""), format, speakers, pathwaySource }) });
    const saved = await service.from("video_producer_episode_scripts").update({
      script_text: script,
      generation_metadata: { model, generatedAt: new Date().toISOString(), pathwaySlugs: slugs },
      theology_review: null,
      status: "draft",
      approved_at: null,
      updated_by: access.user.id
    }).eq("id", episodeId).select("*").single();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    return NextResponse.json({ episode: saved.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Episode generation failed." }, { status: 502 });
  }
}

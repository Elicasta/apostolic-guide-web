import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";
import { episodeFormatLabel, episodeSpeakerSchema, EPISODE_FORMATS } from "@/video-producer-episode-script";
import { buildEpisodeGrowthPlanPrompt, episodeGrowthSourceFingerprint, generateEpisodeGrowthPlan, parseEpisodeGrowthPlan, selectEpisodeGrowthPackage } from "@/video-producer-growth";

const selectionSchema = z.object({
  titleIndex: z.number().int().min(0).max(5).optional(),
  thumbnailIndex: z.number().int().min(0).max(3).optional()
}).refine((value) => value.titleIndex !== undefined || value.thumbnailIndex !== undefined, "Choose a title or thumbnail.");

function sourceFor(slugs: string[]) {
  return slugs.flatMap((slug) => {
    const pathway = pathwayBySlug(slug);
    if (!pathway) return [];
    return [[`PATHWAY: ${pathway.title}`, `SUMMARY: ${pathway.summary}`, ...pathway.steps.map((step, index) => `${index + 1}. ${step.reference} — ${step.title}: ${step.explanation}`)].join("\n")];
  }).join("\n\n");
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
  if (!speakers.length) return NextResponse.json({ error: "Add at least one speaker before packaging the episode." }, { status: 409 });
  const slugs = [String(row.primary_pathway_slug || ""), ...(Array.isArray(row.supporting_pathway_slugs) ? row.supporting_pathway_slugs.map(String) : [])].filter(Boolean);
  const pathwaySource = sourceFor(slugs);
  if (!pathwaySource) return NextResponse.json({ error: "Episode Pathway source could not be built." }, { status: 409 });

  const sourceFingerprint = episodeGrowthSourceFingerprint({
    workingTitle: String(row.title || "Untitled episode"),
    premise: String(row.premise || ""),
    primaryPathwaySlug: String(row.primary_pathway_slug || ""),
    supportingPathwaySlugs: Array.isArray(row.supporting_pathway_slugs) ? row.supporting_pathway_slugs.map(String) : [],
    format,
    speakers
  });

  try {
    const model = process.env.OPENAI_EPISODE_GROWTH_MODEL?.trim() || process.env.OPENAI_EPISODE_MODEL?.trim() || "gpt-5.6-sol";
    const plan = await generateEpisodeGrowthPlan({
      apiKey,
      model,
      sourceFingerprint,
      prompt: buildEpisodeGrowthPlanPrompt({
        workingTitle: String(row.title || "Untitled episode"),
        premise: String(row.premise || ""),
        formatLabel: episodeFormatLabel(format),
        speakers: speakers.map((speaker) => `${speaker.name} (${speaker.role})`),
        pathwaySource
      })
    });
    const metadata = objectValue(row.generation_metadata);
    const saved = await service.from("video_producer_episode_scripts").update({
      growth_plan: plan,
      generation_metadata: { ...metadata, growth: { model, generatedAt: new Date().toISOString(), pathwaySlugs: slugs, contentRevision: plan.contentRevision } },
      theology_review: null,
      status: "draft",
      approved_at: null,
      updated_by: access.user.id
    }).eq("id", episodeId).select("*").single();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    return NextResponse.json({ episode: saved.data, plan });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Episode packaging failed." }, { status: 502 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = selectionSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message || "Invalid package selection." }, { status: 400 });
  const { episodeId } = await context.params;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const result = await service.from("video_producer_episode_scripts").select("*").eq("id", episodeId).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Episode was not found." }, { status: 404 });
  const plan = parseEpisodeGrowthPlan(result.data.growth_plan);
  if (!plan) return NextResponse.json({ error: "Generate the episode package before choosing a title or thumbnail." }, { status: 409 });
  try {
    const selected = selectEpisodeGrowthPackage(plan, body.data);
    const saved = await service.from("video_producer_episode_scripts").update({ growth_plan: selected, updated_by: access.user.id }).eq("id", episodeId).select("*").single();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    return NextResponse.json({ episode: saved.data, plan: selected });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Package selection could not be saved." }, { status: 409 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeSongMechanics, calculateSongOverallScore, determineSongGateStatus, normalizeSongScores } from "@/song-studio/metrics";
import { SONG_EVALUATION_SCHEMA, SONG_WRITE_SCHEMA, SUNO_PREP_SCHEMA, runSongStructuredResponse } from "@/song-studio/openai";
import { buildSongEvaluationPrompt, buildSongRefinePrompt, buildSongWritingPrompt, buildSunoPrompt, SONG_PROMPT_VERSION } from "@/song-studio/prompts";
import { insertSongDraft, recordSongGeneration, requireSongStudioAccess } from "@/song-studio/server";
import type { SongDraft, SongEvaluation, SongProject, SongScores, SongStyleProfile } from "@/song-studio/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  action: z.enum(["write", "refine", "evaluate", "suno_prompt"]),
  project_id: z.string().uuid(),
  draft_id: z.string().uuid().optional(),
  lyrics: z.string().max(30000).optional(),
  instruction: z.string().trim().max(5000).optional()
});

type WriteOutput = {
  title: string;
  lyrics: string;
  theological_center: string;
  scripture_references: string[];
  suno_style_prompt: string;
  production_notes: string;
  negative_style_notes: string[];
  bpm_min: number;
  bpm_max: number;
  editorial_summary: string;
};

type EvaluationOutput = {
  scores: SongScores;
  strengths: string[];
  issues: Array<{
    severity: "blocker" | "warning" | "note";
    category: keyof SongScores | "general";
    line: string;
    note: string;
    suggested_direction: string;
  }>;
  scripture_references: string[];
  theological_notes: string[];
};

type SunoOutput = {
  style_prompt: string;
  production_notes: string;
  negative_style_notes: string[];
  bpm_min: number;
  bpm_max: number;
};

async function loadProject(service: NonNullable<Awaited<ReturnType<typeof requireSongStudioAccess>>["service"]>, projectId: string) {
  const result = await service.from("song_projects").select("*").eq("id", projectId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Song project not found.");
  return result.data as SongProject;
}

async function loadStyle(service: NonNullable<Awaited<ReturnType<typeof requireSongStudioAccess>>["service"]>, styleId: string | null) {
  if (!styleId) return null;
  const result = await service.from("song_style_profiles").select("*").eq("id", styleId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as SongStyleProfile | null;
}

async function loadDraft(service: NonNullable<Awaited<ReturnType<typeof requireSongStudioAccess>>["service"]>, project: SongProject, draftId?: string) {
  const id = draftId ?? project.current_draft_id;
  if (!id) throw new Error("This song does not have a saved draft yet.");
  const result = await service.from("song_drafts").select("*").eq("id", id).eq("project_id", project.id).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Song draft not found.");
  return result.data as SongDraft;
}

async function evaluateDraft({
  service,
  userId,
  apiKey,
  project,
  draft
}: {
  service: NonNullable<Awaited<ReturnType<typeof requireSongStudioAccess>>["service"]>;
  userId: string;
  apiKey: string;
  project: SongProject;
  draft: SongDraft;
}) {
  const mechanics = analyzeSongMechanics(draft.lyrics);
  const model = process.env.OPENAI_SONG_CHECK_MODEL || process.env.OPENAI_SONG_MODEL || "gpt-5.6-sol";
  const prompt = buildSongEvaluationPrompt(project, draft.lyrics, mechanics);
  const response = await runSongStructuredResponse<EvaluationOutput>({
    apiKey,
    model,
    prompt,
    schema: SONG_EVALUATION_SCHEMA,
    schemaName: "apostolic_song_evaluation",
    maxOutputTokens: 4200
  });
  const scores = normalizeSongScores(response.data.scores);
  const overallScore = calculateSongOverallScore(scores);
  const hasBlocker = response.data.issues.some((issue) => issue.severity === "blocker");
  const gateStatus = hasBlocker ? "blocked" : determineSongGateStatus(scores);

  const inserted = await service.from("song_evaluations").insert({
    draft_id: draft.id,
    scores,
    overall_score: overallScore,
    gate_status: gateStatus,
    strengths: response.data.strengths,
    issues: response.data.issues,
    scripture_references: response.data.scripture_references,
    theological_notes: response.data.theological_notes,
    mechanics,
    model: response.model,
    created_by: userId
  }).select("*").single();
  if (inserted.error) throw new Error(inserted.error.message);

  const evaluation = inserted.data as SongEvaluation;
  await service.from("song_projects").update({
    status: gateStatus === "ready_for_suno" ? "ready_for_suno" : "theology_review",
    updated_at: new Date().toISOString()
  }).eq("id", project.id);

  await recordSongGeneration({
    projectId: project.id,
    draftId: draft.id,
    generationType: "evaluate",
    model: response.model,
    promptVersion: SONG_PROMPT_VERSION,
    inputSnapshot: {
      title: draft.title,
      lyrics: draft.lyrics,
      theological_center: project.theological_center,
      core_scriptures: project.core_scriptures,
      mechanics
    },
    outputSnapshot: evaluation as unknown as Record<string, unknown>,
    responseId: response.responseId,
    usage: response.usage,
    userId
  });

  return evaluation;
}

export async function POST(request: Request) {
  const auth = await requireSongStudioAccess();
  if (!auth.ok || !auth.service || !auth.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid AI request.", issues: parsed.error.flatten() }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });

  try {
    const project = await loadProject(auth.service, parsed.data.project_id);
    const style = await loadStyle(auth.service, project.style_profile_id);

    if (parsed.data.action === "write" || parsed.data.action === "refine") {
      if (parsed.data.action === "refine" && (!parsed.data.lyrics?.trim() || !parsed.data.instruction?.trim())) {
        return NextResponse.json({ error: "Refine requires the current lyrics and an editorial instruction." }, { status: 400 });
      }

      const model = process.env.OPENAI_SONG_MODEL || "gpt-5.6-sol";
      const prompt = parsed.data.action === "write"
        ? buildSongWritingPrompt(project, style)
        : buildSongRefinePrompt(project, parsed.data.lyrics!, parsed.data.instruction!, style);
      const response = await runSongStructuredResponse<WriteOutput>({
        apiKey,
        model,
        prompt,
        schema: SONG_WRITE_SCHEMA,
        schemaName: "apostolic_song_draft",
        maxOutputTokens: 5200
      });
      const draft = await insertSongDraft({
        projectId: project.id,
        title: response.data.title,
        lyrics: response.data.lyrics,
        notes: response.data.editorial_summary,
        source: "ai",
        aiModel: response.model,
        aiResponseId: response.responseId,
        aiUsage: response.usage,
        userId: auth.user.id
      });

      await auth.service.from("song_projects").update({
        theological_center: project.theological_center || response.data.theological_center,
        suno_style_prompt: response.data.suno_style_prompt,
        suno_production_notes: response.data.production_notes,
        suno_negative_prompt: response.data.negative_style_notes.join(", "),
        updated_at: new Date().toISOString()
      }).eq("id", project.id);

      await recordSongGeneration({
        projectId: project.id,
        draftId: draft.id,
        generationType: parsed.data.action,
        model: response.model,
        promptVersion: SONG_PROMPT_VERSION,
        inputSnapshot: {
          project,
          style,
          instruction: parsed.data.instruction ?? null,
          prior_lyrics: parsed.data.action === "refine" ? parsed.data.lyrics : null
        },
        outputSnapshot: response.data as unknown as Record<string, unknown>,
        responseId: response.responseId,
        usage: response.usage,
        userId: auth.user.id
      });

      const freshProject = { ...project, title: draft.title, working_title: draft.title } as SongProject;
      const evaluation = await evaluateDraft({ service: auth.service, userId: auth.user.id, apiKey, project: freshProject, draft });
      return NextResponse.json({ draft, evaluation, generation: response.data });
    }

    const draft = await loadDraft(auth.service, project, parsed.data.draft_id);

    if (parsed.data.action === "evaluate") {
      const evaluation = await evaluateDraft({ service: auth.service, userId: auth.user.id, apiKey, project, draft });
      return NextResponse.json({ draft, evaluation });
    }

    const existingEval = await auth.service.from("song_evaluations").select("gate_status, overall_score").eq("draft_id", draft.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existingEval.error) throw new Error(existingEval.error.message);
    if (!existingEval.data || existingEval.data.gate_status !== "ready_for_suno") {
      return NextResponse.json({ error: "This draft has not cleared the Song Studio quality gate. Evaluate and resolve blockers before preparing Suno metadata." }, { status: 409 });
    }

    const model = process.env.OPENAI_SONG_MODEL || "gpt-5.6-sol";
    const response = await runSongStructuredResponse<SunoOutput>({
      apiKey,
      model,
      prompt: buildSunoPrompt(project, draft.lyrics, style),
      schema: SUNO_PREP_SCHEMA,
      schemaName: "apostolic_song_suno_prep",
      maxOutputTokens: 1800
    });
    const updated = await auth.service.from("song_projects").update({
      suno_style_prompt: response.data.style_prompt,
      suno_production_notes: `${response.data.production_notes}\nBPM: ${response.data.bpm_min}-${response.data.bpm_max}`,
      suno_negative_prompt: response.data.negative_style_notes.join(", "),
      status: "ready_for_suno",
      updated_at: new Date().toISOString()
    }).eq("id", project.id).select("*").single();
    if (updated.error) throw new Error(updated.error.message);

    await recordSongGeneration({
      projectId: project.id,
      draftId: draft.id,
      generationType: "suno_prompt",
      model: response.model,
      promptVersion: SONG_PROMPT_VERSION,
      inputSnapshot: { project, draft_id: draft.id, style, evaluation_score: existingEval.data.overall_score },
      outputSnapshot: response.data as unknown as Record<string, unknown>,
      responseId: response.responseId,
      usage: response.usage,
      userId: auth.user.id
    });

    return NextResponse.json({ project: updated.data, suno: response.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Song Studio AI failed." }, { status: 500 });
  }
}

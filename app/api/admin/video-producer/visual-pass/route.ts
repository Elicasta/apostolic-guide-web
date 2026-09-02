import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { normalizeVideoProducerTranscript, sliceVideoProducerTranscript, transcriptForModel } from "@/video-producer-ai";
import { extractOpenAIResponseText, videoProducerOpenAIKey } from "@/video-producer-server";
import { VIDEO_PRODUCER_VISUAL_VOCABULARY, normalizeVisualAvoid, normalizeVisualSearchQueries } from "@/video-producer-visuals";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({ projectId: z.string().uuid() });
const recommendation = z.enum(["a-roll", "punch-in", "camera-b", "scripture", "graphic", "b-roll"]);
const vocabulary = z.enum(["scripture", "god-eternity", "incarnation", "history", "debate-argument", "humanity", "church-life", "abstract-editorial"]);
const outputSchema = z.object({
  summary: z.string().max(1200),
  beats: z.array(z.object({
    start: z.number(),
    duration: z.number(),
    dialogue: z.string().max(1000),
    recommendation,
    intent: z.string().min(1).max(800),
    searchQueries: z.array(z.string().max(120)).max(6),
    vocabulary,
    preferredStyle: z.string().max(180).nullable(),
    avoid: z.array(z.string().max(100)).max(12)
  })).max(180)
});

const OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "beats"],
  properties: {
    summary: { type: "string" },
    beats: {
      type: "array",
      maxItems: 180,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start", "duration", "dialogue", "recommendation", "intent", "searchQueries", "vocabulary", "preferredStyle", "avoid"],
        properties: {
          start: { type: "number" },
          duration: { type: "number" },
          dialogue: { type: "string" },
          recommendation: { type: "string", enum: recommendation.options },
          intent: { type: "string" },
          searchQueries: { type: "array", maxItems: 6, items: { type: "string" } },
          vocabulary: { type: "string", enum: vocabulary.options },
          preferredStyle: { type: ["string", "null"] },
          avoid: { type: "array", maxItems: 12, items: { type: "string" } }
        }
      }
    }
  }
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function visualDirectorRules(mode: "podcast" | "reels") {
  const vocabularyLines = Object.entries(VIDEO_PRODUCER_VISUAL_VOCABULARY)
    .map(([id, spec]) => `${id}: ${spec.searchTerms.join(", ")}`);
  return [
    "You are the Apostolic Guide Visual Pass director. Build an assembly plan, not a final cut.",
    "The supplied timestamped transcript is the source of truth. Never invent dialogue or a theological claim.",
    "Every beat timestamp is in LOCAL source time. Dialogue must be a faithful excerpt from the supplied transcript near that timestamp.",
    "Apostolic Guide long-form pacing is fast, intentional and editorial. Keep forward momentum without hyperactive short-form editing.",
    "Continuously evaluate whether the viewer has been looking at a substantially unchanged composition for roughly 6-12 seconds. A visual reset may be A-roll, subtle punch-in, Camera B, Scripture, key typography, diagram, B-roll, or a chapter/objection graphic. Do not force a reset just because time passed. Stillness is valid when the sentence earns it.",
    "Prefer evidence and clarity over decoration. For doctrine, objections, comparisons, quoted phrases, verse relationships, timelines, or claims that need proof, GRAPHIC or SCRIPTURE often beats B-ROLL.",
    "Use B-ROLL only when it explains, demonstrates, locates, contrasts, provides meaningful texture, or gives the viewer a useful visual reset.",
    "Never propose literal AI Bible-movie imagery: no actor portraying Jesus, Moses, apostles, prophets, ancient Israelites, or biblical events; no glowing Bible; no cross silhouette at sunset; no fantasy church-stock imagery.",
    "When a concept would require pretending generated footage depicts a historical biblical event, choose scripture, graphic, A-roll, or an abstract/documentary fragment instead.",
    "For B-roll search, write concrete stock-friendly queries such as 'ancient manuscript macro', 'Bible page turning natural light', 'ink on parchment', 'old stone church detail'. Avoid theological search phrases that stock APIs will not understand.",
    "For generated inserts, think cinematic fragments: archival paper, ink, dust in a light shaft, stone, fabric, skin, hands, maps, glass, water, shadow, or abstract physical phenomena. No visible generated text.",
    "Image-to-video is preferred when an art-directed still can control composition. Generated motion should be subtle and physically believable.",
    "Do not cover every sentence. The speaker remains the primary visual. Use visual beats where they materially help pacing or comprehension.",
    mode === "reels"
      ? "REELS: favor tighter reset intervals and concise full-frame evidence, but do not create generic creator-caption chaos."
      : "LONG FORM: controlled momentum. Clean A-roll can hold longer when delivery is strong; visual changes should feel authored, not automatic.",
    "VISUAL VOCABULARY:",
    ...vocabularyLines,
    "Return decisions only. Search, generation, licensing, download, placement and rendering are handled by code."
  ];
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const [projectResult, beatsResult, placementsResult, jobsResult, generationResult] = await Promise.all([
    service.from("video_producer_projects").select("id,title,mode,status,pathway_slug,source_duration,edit_plan,approval_fingerprint").eq("id", projectId).is("deleted_at", null).maybeSingle(),
    service.from("video_producer_visual_beats").select("*").eq("project_id", projectId).order("source_start"),
    service.from("video_producer_visual_placements").select("*,asset:video_producer_visual_assets(*)").eq("project_id", projectId).eq("active", true).order("source_start"),
    service.from("video_producer_visual_import_jobs").select("id,beat_id,provider,status,progress,asset_id,placement_id,error,created_at,completed_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(100),
    service.from("video_producer_visual_generation_jobs").select("id,beat_id,provider,model,generation_mode,status,asset_id,error,created_at,completed_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(100)
  ]);
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  if (!projectResult.data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  for (const result of [beatsResult, placementsResult, jobsResult, generationResult]) {
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  }
  return NextResponse.json({
    project: projectResult.data,
    beats: beatsResult.data ?? [],
    placements: placementsResult.data ?? [],
    importJobs: jobsResult.data ?? [],
    generationJobs: generationResult.data ?? [],
    providers: {
      pexels: Boolean(process.env.PEXELS_API_KEY?.trim()),
      pixabay: Boolean(process.env.PIXABAY_API_KEY?.trim()),
      runway: Boolean(process.env.RUNWAYML_API_SECRET?.trim()),
      firefly: Boolean(process.env.FIREFLY_SERVICES_CLIENT_ID?.trim() && process.env.FIREFLY_SERVICES_CLIENT_SECRET?.trim() && process.env.FIREFLY_VIDEO_GENERATE_ENDPOINT?.trim())
    }
  });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Visual Pass request." }, { status: 400 });
  const apiKey = videoProducerOpenAIKey();
  if (!apiKey) return NextResponse.json({ error: "VIDEO_PRODUCER_OPENAI_API_KEY is not configured." }, { status: 503 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,title,mode,status,source_duration,source_range_start,source_range_end,transcript,edit_plan,director_metadata")
    .eq("id", parsed.data.projectId).is("deleted_at", null).maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (project.mode !== "podcast" && project.mode !== "reels") return NextResponse.json({ error: "Unsupported Video Producer mode." }, { status: 409 });
  if (!project.edit_plan) return NextResponse.json({ error: "Run the Edit Director before the Visual Pass." }, { status: 409 });
  if (["uploading", "transcribing", "directing", "rendering"].includes(project.status)) return NextResponse.json({ error: "Wait for the current production job to finish before analyzing visuals." }, { status: 409 });

  const fullTranscript = normalizeVideoProducerTranscript(project.transcript);
  const localTranscript = project.source_range_start != null && project.source_range_end != null
    ? sliceVideoProducerTranscript(fullTranscript, Number(project.source_range_start), Number(project.source_range_end))
    : fullTranscript;
  if (!localTranscript.text || localTranscript.duration <= 0) return NextResponse.json({ error: "Timestamped transcript is required for the Visual Pass." }, { status: 409 });

  const model = process.env.OPENAI_VIDEO_PRODUCER_MODEL?.trim() || process.env.OPENAI_VIDEO_DIRECTOR_MODEL?.trim() || "gpt-5.6-sol";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        reasoning: { effort: "medium" },
        text: { verbosity: "low", format: { type: "json_schema", name: "ag_video_visual_pass", strict: true, schema: OUTPUT_JSON_SCHEMA } },
        input: [
          { role: "developer", content: [{ type: "input_text", text: visualDirectorRules(project.mode).join("\n") }] },
          { role: "user", content: [{ type: "input_text", text: [
            `PROJECT: ${project.title}`,
            `MODE: ${project.mode}`,
            `DURATION: ${localTranscript.duration.toFixed(2)} seconds`,
            "TIMESTAMPED TRANSCRIPT:",
            transcriptForModel(localTranscript)
          ].join("\n\n") }] }
        ]
      })
    });
    if (!response.ok) throw new Error(`Visual Director failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 800)}`);
    const rawText = extractOpenAIResponseText(await response.json());
    if (!rawText) throw new Error("Visual Director returned no structured output.");
    const output = outputSchema.parse(JSON.parse(rawText));
    const rows = output.beats.flatMap((beat) => {
      const sourceStart = clamp(beat.start, 0, localTranscript.duration);
      if (sourceStart >= localTranscript.duration - 0.05) return [];
      const duration = Math.min(clamp(beat.duration, 0.75, 12), localTranscript.duration - sourceStart);
      return [{
        project_id: project.id,
        source_start: sourceStart,
        duration,
        dialogue: beat.dialogue.replace(/\s+/g, " ").trim().slice(0, 1000),
        recommendation: beat.recommendation,
        intent: beat.intent.replace(/\s+/g, " ").trim().slice(0, 800),
        search_queries: normalizeVisualSearchQueries(beat.searchQueries, 6),
        vocabulary: beat.vocabulary,
        preferred_style: beat.preferredStyle?.replace(/\s+/g, " ").trim().slice(0, 180) || null,
        avoid: normalizeVisualAvoid(beat.avoid, 12),
        status: beat.recommendation === "b-roll" ? "open" : "resolved",
        source: "sol",
        revision: 1,
        created_by: access.user.id,
        updated_by: access.user.id
      }];
    });

    const existingPlacements = await service.from("video_producer_visual_placements").select("id").eq("project_id", project.id).eq("active", true).limit(1);
    if (existingPlacements.error) throw new Error(existingPlacements.error.message);
    if (existingPlacements.data?.length) {
      return NextResponse.json({ error: "This project already has Visual Pass placements. Remove or replace them deliberately instead of regenerating the beat map over approved assembly decisions." }, { status: 409 });
    }

    const cleared = await service.from("video_producer_visual_beats").delete().eq("project_id", project.id);
    if (cleared.error) throw new Error(cleared.error.message);
    const inserted = rows.length
      ? await service.from("video_producer_visual_beats").insert(rows).select("*")
      : { data: [], error: null };
    if (inserted.error) throw new Error(inserted.error.message);

    const metadata = project.director_metadata && typeof project.director_metadata === "object" ? project.director_metadata as Record<string, unknown> : {};
    const saved = await service.from("video_producer_projects").update({
      director_metadata: {
        ...metadata,
        visualPass: { model, analyzedAt: new Date().toISOString(), summary: output.summary, beatCount: rows.length, assemblyAuthority: true, finalCutAuthority: false }
      },
      updated_by: access.user.id
    }).eq("id", project.id);
    if (saved.error) throw new Error(saved.error.message);
    return NextResponse.json({ beats: inserted.data ?? [], summary: output.summary });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Visual Pass failed." }, { status: 502 });
  }
}

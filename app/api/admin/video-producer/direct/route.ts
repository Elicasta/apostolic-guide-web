import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";
import type { VideoProducerEditPlan } from "@/video-producer";
import {
  normalizeVideoProducerDirectorOutput,
  normalizeVideoProducerTranscript,
  sliceVideoProducerTranscript,
  transcriptForModel,
  VIDEO_PRODUCER_DIRECTOR_JSON_SCHEMA,
  type VideoProducerTranscript
} from "@/video-producer-ai";
import { extractOpenAIResponseText, videoProducerOpenAIKey } from "@/video-producer-server";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  projectId: z.string().uuid(),
  captionStyle: z.enum(["kinetic-clean", "word-pop", "editorial", "minimal"]).optional(),
  captionAnimation: z.enum(["pop", "rise", "highlight", "none"]).optional()
});

function directorRules(mode: "podcast" | "reels", hasPathway: boolean) {
  const shared = [
    "You are the Apostolic Guide Video Producer Edit Director.",
    "The supplied transcript is the source of truth. Never invent, paraphrase into a new theological claim, reorder spoken words, or manufacture a hook that was not actually spoken.",
    "All timestamps must refer to the supplied LOCAL transcript timeline, starting at 0.00 seconds.",
    "Cuts remove source time. Only cut ranges that are clearly expendable from the spoken material.",
    "Scripture overlays may quote only references or ideas actually present in the transcript. Do not fabricate a Bible reference.",
    "Apostolic Guide owns a fixed Broadcast Graphics System V2. You choose semantic overlay kind, timing, copy, placement and restrained animation; code owns typography, colors, scale, framing and visual execution. Never describe a design inside overlay copy.",
    "The opening must never fall visually empty after the title/brand card. Return one concise opening statement or pathway overlay in roughly the first 0.25-1.25 seconds of source footage, lasting about 3-5 seconds. It must express the actual spoken hook, central question, or episode promise without inventing a claim.",
    "Use lower-third for a speaker/name identifier only when the identity or role is actually known from project/transcript context.",
    "Use pathway for one compact pathway introduction near the beginning when pathway context is supplied. Do not repeatedly emit pathway bugs; the renderer owns the persistent left-side pathway follower.",
    "SCRIPTURE V2: a short, readable Scripture claim should use lower-third and normally stay under about 70 characters. A longer passage, anchor verse, or verse that would need tiny text must use full-frame or center. Never solve a long verse by shrinking it.",
    "Scripture title contains the readable verse/claim in normal sentence case. reference contains the Bible reference. Do not put the reference into title.",
    "Use chapter only for a genuine pathway/teaching section transition. When pathway context is supplied, chapter means PATHWAY STOP; align the chapter title and reference to the closest supplied pathway step rather than inventing generic chapter numbers.",
    "Use statement for one especially strong key point. Use quote for a short direct quotable line. Use cta only for a real next action supported by context.",
    "Graphics should support the speaker, not cover every sentence. Titles must be concise enough for broadcast typography.",
    "Return decisions only. Code performs the edit."
  ];
  if (hasPathway) shared.push("A PATHWAY CONTEXT block is supplied. Treat its step order, step titles and Bible references as authoritative for pathway-stop structure.");
  if (mode === "podcast") return [...shared,
    "PODCAST MODE: prioritize professional long-form clarity, natural pacing, and doctrinal continuity over aggressive retention editing.",
    "Cuts may remove false starts, obvious repeated takes, accidental dead air, and verbal resets. Do not remove substantive teaching merely to shorten runtime.",
    "Normally keep total removed source under 20 percent. The system will reject a plan over 35 percent.",
    "Use the opening overlay as an editorial promise immediately after the title bumper, then let the teaching breathe.",
    "Use full-frame pathway-stop cards only at meaningful transitions. Between stops, the renderer will maintain a compact left-side follower automatically.",
    "Use Scripture lower-thirds for short lines while teaching; promote anchor/long Scripture to a full-frame card.",
    "Motion should be restrained. Use subtle punch-ins or reframes only when useful. Avoid strong social-media style motion.",
    "Do not return music decisions. Music is selected separately from the approved AG library."
  ];
  return [...shared,
    "REELS MODE: optimize a self-contained short clip for retention without making it frantic or generic.",
    "Protect the actual spoken hook. Tighten dead air, repeated phrases, stumbles, and unnecessary setup, but preserve the logical sentence that makes the claim understandable.",
    "The opening statement is mandatory: make the viewer understand the question/promise before the first visual beat goes quiet.",
    "Use punch-ins and reframes at meaningful emphasis beats. focusX and focusY are normalized 0 to 1. scale should usually stay between 1.04 and 1.22.",
    "Use animated captions separately from overlays. Overlays are for Scripture, one key statement, a pathway/topic marker, or the final CTA.",
    "Never fake B-roll. A b-roll cue may only be a note for later human/asset selection.",
    "Do not return music decisions. Music is selected separately from the approved AG library."
  ];
}

function cleanHook(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= 120 ? text : `${text.slice(0, 117).trim()}…`;
}

function fallbackOpeningHook(metadata: Record<string, unknown>, projectTitle: string, transcript: VideoProducerTranscript) {
  const candidate = metadata.candidate && typeof metadata.candidate === "object" ? metadata.candidate as Record<string, unknown> : null;
  const candidateHook = cleanHook(candidate?.hook);
  if (candidateHook) return candidateHook;

  const firstSegment = transcript.segments.find((segment) => segment.text.trim())?.text;
  const spoken = cleanHook(firstSegment);
  const genericTitle = /^(img|dsc|mov|video|untitled)[\s_-]*\d*/i.test(projectTitle.trim());
  if (!genericTitle) {
    const title = cleanHook(projectTitle);
    if (title) return title;
  }
  return spoken || "Apostolic Guide";
}

function firstVisibleSourceTime(plan: VideoProducerEditPlan) {
  const firstCut = [...plan.cuts].sort((a, b) => a.start - b.start)[0];
  if (firstCut && firstCut.start <= 0.3) return Math.min(plan.sourceDuration - 0.5, Math.max(0.1, firstCut.end + 0.12));
  return Math.min(plan.sourceDuration - 0.5, 0.2);
}

function ensureOpeningHook(plan: VideoProducerEditPlan, hook: string) {
  const hasOpeningGraphic = plan.overlays.some((overlay) => overlay.start <= 1.5 && ["statement", "quote", "pathway", "chapter"].includes(overlay.kind));
  if (hasOpeningGraphic || plan.sourceDuration <= 1) return;
  const start = Math.max(0, firstVisibleSourceTime(plan));
  plan.overlays.unshift({
    id: "opening-hook",
    kind: "statement",
    start,
    duration: Math.min(4.2, Math.max(0.8, plan.sourceDuration - start)),
    title: hook,
    animation: plan.mode === "reels" ? "rise" : "fade",
    placement: "center"
  });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid director request." }, { status: 400 });
  const apiKey = videoProducerOpenAIKey();
  if (!apiKey) return NextResponse.json({ error: "VIDEO_PRODUCER_OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_VIDEO_PRODUCER_MODEL?.trim() || process.env.OPENAI_VIDEO_DIRECTOR_MODEL?.trim() || "gpt-5.6-sol";
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,title,mode,status,pathway_slug,selected_music_track_id,source_duration,source_range_start,source_range_end,transcript,director_metadata")
    .eq("id", parsed.data.projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });
  if (project.mode !== "podcast" && project.mode !== "reels") return NextResponse.json({ error: "Unsupported producer mode." }, { status: 409 });

  const fullTranscript = normalizeVideoProducerTranscript(project.transcript);
  if (!fullTranscript.words.length || !fullTranscript.text) return NextResponse.json({ error: "Transcribe the source before running the Edit Director." }, { status: 409 });
  const localTranscript = project.source_range_start != null && project.source_range_end != null
    ? sliceVideoProducerTranscript(fullTranscript, Number(project.source_range_start), Number(project.source_range_end))
    : fullTranscript;
  if (!localTranscript.words.length || localTranscript.duration <= 0) return NextResponse.json({ error: "The selected reel source range has no transcript content." }, { status: 409 });

  const pathway = project.pathway_slug ? pathwayBySlug(project.pathway_slug) : null;
  if (project.pathway_slug && !pathway) return NextResponse.json({ error: "The selected pathway is no longer available." }, { status: 409 });
  const pathwayContext = pathway ? [
    `PATHWAY: ${pathway.title}`,
    `PATHWAY SUMMARY: ${pathway.summary}`,
    "PATHWAY STEPS:",
    ...pathway.steps.map((step, index) => `${index + 1}. ${step.title} — ${step.reference} — ${step.explanation}`)
  ].join("\n") : "PATHWAY: none selected";

  const metadata = project.director_metadata && typeof project.director_metadata === "object"
    ? project.director_metadata as Record<string, unknown>
    : {};
  await service.from("video_producer_projects").update({ status: "directing", updated_by: access.user.id }).eq("id", project.id);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        reasoning: { effort: "medium" },
        text: {
          verbosity: "low",
          format: { type: "json_schema", name: `ag_video_producer_${project.mode}_director`, strict: true, schema: VIDEO_PRODUCER_DIRECTOR_JSON_SCHEMA }
        },
        input: [
          { role: "developer", content: [{ type: "input_text", text: directorRules(project.mode, Boolean(pathway)).join("\n") }] },
          { role: "user", content: [{ type: "input_text", text: [
            `PROJECT: ${project.title}`,
            `MODE: ${project.mode}`,
            `LOCAL DURATION: ${localTranscript.duration.toFixed(2)} seconds`,
            pathwayContext,
            "TIMESTAMPED TRANSCRIPT:",
            transcriptForModel(localTranscript)
          ].join("\n\n") }] }
        ]
      })
    });
    if (!response.ok) throw new Error(`Edit Director failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 900)}`);
    const result = await response.json();
    const output = extractOpenAIResponseText(result);
    if (!output) throw new Error("Edit Director returned no structured output.");
    const directed = normalizeVideoProducerDirectorOutput(JSON.parse(output), project.mode, localTranscript.duration);
    ensureOpeningHook(directed.plan, fallbackOpeningHook(metadata, project.title, localTranscript));
    if (project.mode === "reels") {
      if (parsed.data.captionStyle) directed.plan.captions.style = parsed.data.captionStyle;
      if (parsed.data.captionAnimation) directed.plan.captions.animation = parsed.data.captionAnimation;
    }
    if (project.selected_music_track_id) {
      directed.plan.music = [{
        id: "ag-music-bed",
        trackId: project.selected_music_track_id,
        start: 0,
        end: localTranscript.duration,
        gainDb: project.mode === "reels" ? -24 : -28,
        duckUnderVoice: true
      }];
    }
    const now = new Date().toISOString();
    const saved = await service.from("video_producer_projects").update({
      status: "planned",
      edit_plan: directed.plan,
      approval_fingerprint: null,
      approved_at: null,
      director_metadata: {
        ...metadata,
        director: { model, directedAt: now, summary: directed.summary, mode: project.mode, localDuration: localTranscript.duration, pathwaySlug: pathway?.slug ?? null }
      },
      updated_by: access.user.id
    }).eq("id", project.id).select("*").single();
    if (saved.error) throw new Error(saved.error.message);
    return NextResponse.json({ project: saved.data, plan: directed.plan, summary: directed.summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Edit Director failed.";
    await service.from("video_producer_projects").update({
      status: "uploaded",
      director_metadata: { ...metadata, directorError: message, directorFailedAt: new Date().toISOString() },
      updated_by: access.user.id
    }).eq("id", project.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

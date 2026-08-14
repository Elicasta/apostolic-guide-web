import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import {
  normalizeVideoProducerDirectorOutput,
  normalizeVideoProducerTranscript,
  sliceVideoProducerTranscript,
  transcriptForModel,
  VIDEO_PRODUCER_DIRECTOR_JSON_SCHEMA
} from "@/video-producer-ai";
import { extractOpenAIResponseText } from "@/video-producer-server";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  projectId: z.string().uuid(),
  captionStyle: z.enum(["kinetic-clean", "word-pop", "editorial", "minimal"]).optional(),
  captionAnimation: z.enum(["pop", "rise", "highlight", "none"]).optional()
});

function directorRules(mode: "podcast" | "reels") {
  const shared = [
    "You are the Apostolic Guide Video Producer Edit Director.",
    "The supplied transcript is the source of truth. Never invent, paraphrase into a new theological claim, reorder spoken words, or manufacture a hook that was not actually spoken.",
    "All timestamps must refer to the supplied LOCAL transcript timeline, starting at 0.00 seconds.",
    "Cuts remove source time. Only cut ranges that are clearly expendable from the spoken material.",
    "Scripture overlays may quote only references or ideas actually present in the transcript. Do not fabricate a Bible reference.",
    "Graphics should support the speaker, not cover every sentence. Keep titles concise and readable.",
    "Return decisions only. Code performs the edit."
  ];
  if (mode === "podcast") return [...shared,
    "PODCAST MODE: prioritize professional long-form clarity, natural pacing, and doctrinal continuity over aggressive retention editing.",
    "Cuts may remove false starts, obvious repeated takes, accidental dead air, and verbal resets. Do not remove substantive teaching merely to shorten runtime.",
    "Normally keep total removed source under 20 percent. The system will reject a plan over 35 percent.",
    "Use chapter overlays for genuine topic transitions, Scripture overlays when a passage is being discussed, and statement cards only for especially strong spoken claims.",
    "Motion should be restrained. Use subtle punch-ins or reframes only when useful. Avoid strong social-media style motion.",
    "Do not return music decisions. Music is selected later from the approved AG library."
  ];
  return [...shared,
    "REELS MODE: optimize a self-contained short clip for retention without making it frantic or generic.",
    "Protect the actual spoken hook. Tighten dead air, repeated phrases, stumbles, and unnecessary setup, but preserve the logical sentence that makes the claim understandable.",
    "Use punch-ins and reframes at meaningful emphasis beats. focusX and focusY are normalized 0 to 1. scale should usually stay between 1.04 and 1.22.",
    "Use animated captions separately from overlays. Overlays are for Scripture references, short statements, or the final CTA.",
    "Never fake B-roll. A b-roll cue may only be a note for later human/asset selection.",
    "Do not return music decisions. Music is selected later from the approved AG library."
  ];
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid director request." }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_VIDEO_PRODUCER_MODEL?.trim() || process.env.OPENAI_VIDEO_DIRECTOR_MODEL?.trim() || "gpt-5.6-sol";
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,title,mode,status,source_duration,source_range_start,source_range_end,transcript,director_metadata")
    .eq("id", parsed.data.projectId)
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
          { role: "developer", content: [{ type: "input_text", text: directorRules(project.mode).join("\n") }] },
          { role: "user", content: [{ type: "input_text", text: [
            `PROJECT: ${project.title}`,
            `MODE: ${project.mode}`,
            `LOCAL DURATION: ${localTranscript.duration.toFixed(2)} seconds`,
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
    if (project.mode === "reels") {
      if (parsed.data.captionStyle) directed.plan.captions.style = parsed.data.captionStyle;
      if (parsed.data.captionAnimation) directed.plan.captions.animation = parsed.data.captionAnimation;
    }
    const now = new Date().toISOString();
    const saved = await service.from("video_producer_projects").update({
      status: "planned",
      edit_plan: directed.plan,
      approval_fingerprint: null,
      approved_at: null,
      director_metadata: {
        ...metadata,
        director: { model, directedAt: now, summary: directed.summary, mode: project.mode, localDuration: localTranscript.duration }
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

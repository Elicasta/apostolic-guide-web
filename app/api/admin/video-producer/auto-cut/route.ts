import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import type { VideoProducerEditPlan } from "@/video-producer";
import {
  normalizeVideoProducerTranscript,
  sliceVideoProducerTranscript,
  transcriptForModel
} from "@/video-producer-ai";
import {
  normalizeVideoProducerCameraDirectorOutput,
  VIDEO_PRODUCER_CAMERA_DIRECTOR_JSON_SCHEMA
} from "@/video-producer-camera-ai";
import { mediaLocalCoverage, type VideoProducerCameraPlan } from "@/video-producer-multicam";
import { extractOpenAIResponseText, videoProducerOpenAIKey } from "@/video-producer-server";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({ projectId: z.string().uuid() });

function cameraRules(mode: "podcast" | "reels") {
  return [
    "You are the Apostolic Guide Smart Auto Cut camera director.",
    "You do not change spoken content, graphics, Scripture, captions, audio, color, music, or content cuts. You decide only whether Camera A or synchronized Camera B should be visible.",
    "Camera A is the authority/default angle. Camera B is punctuation and visual relief, not a 50/50 alternate feed.",
    "Return source-time camera switch decisions only. The first visible camera is always A, so do not return a decision at 0.00.",
    "Place switches near sentence, phrase, pause, emphasis, or topic boundaries. Avoid cutting in the middle of words or awkward thought units.",
    mode === "podcast"
      ? "For long-form Podcast Mode, normally keep Camera B to roughly 15-30 percent of visible speaking time, with shots usually 4-12 seconds or longer when the idea needs to breathe."
      : "For Reels Mode, Camera B may be slightly more active, but avoid frantic A/B ping-pong; shots should normally last at least 2.5-6 seconds.",
    "Do not select Camera B outside the supplied CAMERA B COVERAGE window.",
    "Do not spend a camera switch underneath a full-frame content graphic when the switch cannot be seen.",
    "Use Camera B intentionally for strong emphasis, resets after a long A run, rhetorical questions, topic transitions, or visual pacing.",
    "A return to Camera A should feel like a return to the authority angle.",
    "LOCKED CAMERA DECISIONS are human decisions. Do not contradict or crowd them; code preserves them exactly.",
    "Return only camera decisions. Code validates, snaps, limits, and renders them."
  ].join("\n");
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Smart Auto Cut request." }, { status: 400 });
  const apiKey = videoProducerOpenAIKey();
  if (!apiKey) return NextResponse.json({ error: "VIDEO_PRODUCER_OPENAI_API_KEY is not configured." }, { status: 503 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,title,mode,parent_project_id,status,source_duration,source_range_start,source_range_end,transcript,edit_plan,camera_plan,media_revision")
    .eq("id", parsed.data.projectId).is("deleted_at", null).maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project || (project.mode !== "podcast" && project.mode !== "reels")) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });
  if (!project.edit_plan) return NextResponse.json({ error: "Generate the content Producer plan before Smart Auto Cut." }, { status: 409 });

  const rootId = project.parent_project_id || project.id;
  const cameraBResult = await service.from("video_producer_media_assets")
    .select("id,duration,sync_status,offset_seconds,revision")
    .eq("project_id", rootId).eq("role", "camera_b").eq("active", true).maybeSingle();
  if (cameraBResult.error) return NextResponse.json({ error: cameraBResult.error.message }, { status: 500 });
  const cameraB = cameraBResult.data;
  if (!cameraB || !["synced", "manual"].includes(cameraB.sync_status) || cameraB.offset_seconds == null || cameraB.duration == null) {
    return NextResponse.json({ error: "Camera B must be synchronized before Smart Auto Cut can run." }, { status: 409 });
  }

  const fullTranscript = normalizeVideoProducerTranscript(project.transcript);
  const localTranscript = project.source_range_start != null && project.source_range_end != null
    ? sliceVideoProducerTranscript(fullTranscript, Number(project.source_range_start), Number(project.source_range_end))
    : fullTranscript;
  if (!localTranscript.text || localTranscript.duration <= 0) return NextResponse.json({ error: "Timestamped transcript is required before Smart Auto Cut." }, { status: 409 });

  const coverage = mediaLocalCoverage(
    Number(cameraB.duration),
    Number(cameraB.offset_seconds),
    Number(project.source_range_start || 0),
    project.source_range_end != null ? Number(project.source_range_end) : null
  );
  if (!coverage) return NextResponse.json({ error: "Camera B does not overlap this project range." }, { status: 409 });
  const contentPlan = project.edit_plan as VideoProducerEditPlan;
  const existingPlan = project.camera_plan as VideoProducerCameraPlan | null;
  const locked = (existingPlan?.decisions ?? []).filter((decision) => decision.locked);
  const model = process.env.OPENAI_VIDEO_PRODUCER_MODEL?.trim() || process.env.OPENAI_VIDEO_DIRECTOR_MODEL?.trim() || "gpt-5.6-sol";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        reasoning: { effort: "medium" },
        text: {
          verbosity: "low",
          format: { type: "json_schema", name: "ag_video_producer_camera_director", strict: true, schema: VIDEO_PRODUCER_CAMERA_DIRECTOR_JSON_SCHEMA }
        },
        input: [
          { role: "developer", content: [{ type: "input_text", text: cameraRules(project.mode) }] },
          { role: "user", content: [{ type: "input_text", text: [
            `PROJECT: ${project.title}`,
            `MODE: ${project.mode}`,
            `LOCAL DURATION: ${localTranscript.duration.toFixed(2)} seconds`,
            `CAMERA B COVERAGE: ${coverage.start.toFixed(2)}-${coverage.end.toFixed(2)} seconds`,
            `CONTENT CUTS: ${contentPlan.cuts.map((cut) => `${cut.start.toFixed(2)}-${cut.end.toFixed(2)}`).join(", ") || "none"}`,
            `FULL-FRAME GRAPHICS: ${contentPlan.overlays.filter((overlay) => overlay.placement === "full-frame").map((overlay) => `${overlay.start.toFixed(2)}-${(overlay.start + overlay.duration).toFixed(2)} ${overlay.title}`).join(" | ") || "none"}`,
            `LOCKED CAMERA DECISIONS: ${locked.map((decision) => `${decision.at.toFixed(2)} -> ${decision.camera}`).join(", ") || "none"}`,
            "TIMESTAMPED TRANSCRIPT:",
            transcriptForModel(localTranscript)
          ].join("\n\n") }] }
        ]
      })
    });
    if (!response.ok) throw new Error(`Camera Director failed (${response.status}): ${(await response.text().catch(() => "")).slice(0, 900)}`);
    const result = await response.json();
    const output = extractOpenAIResponseText(result);
    if (!output) throw new Error("Camera Director returned no structured output.");
    const directed = normalizeVideoProducerCameraDirectorOutput(JSON.parse(output), {
      duration: localTranscript.duration,
      transcript: localTranscript,
      coverage,
      existingPlan,
      mode: project.mode
    });
    directed.plan.sourceRevision = Number(cameraB.revision || project.media_revision || 1);
    const saved = await service.from("video_producer_projects").update({
      camera_plan: directed.plan,
      approval_fingerprint: null,
      approved_at: null,
      status: "planned",
      updated_by: access.user.id
    }).eq("id", project.id).select("*").single();
    if (saved.error) throw new Error(saved.error.message);
    return NextResponse.json({ project: saved.data, cameraPlan: directed.plan, summary: directed.summary, coverage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Smart Auto Cut failed." }, { status: 502 });
  }
}

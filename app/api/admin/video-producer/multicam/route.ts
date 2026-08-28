import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import {
  VIDEO_PRODUCER_PRIMARY_CAMERA_ID,
  buildSmartVideoProducerCameraDecisions,
  getVideoProducerMulticamMetadata,
  normalizeVideoProducerCameraDecisions,
  withVideoProducerMulticamMetadata
} from "@/video-producer-multicam";
import { deletePrivateVideoProducerBlob } from "@/video-producer-server";

export const runtime = "nodejs";

const decisionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  sourceId: z.string().trim().min(1).max(80),
  start: z.number().nonnegative(),
  end: z.number().positive()
}).refine((value) => value.end > value.start, { message: "Camera decision end must be after start." });

const schema = z.discriminatedUnion("action", [
  z.object({ projectId: z.string().uuid(), action: z.literal("update-decisions"), decisions: z.array(decisionSchema).max(500) }),
  z.object({ projectId: z.string().uuid(), action: z.literal("regenerate") }),
  z.object({ projectId: z.string().uuid(), action: z.literal("manual-sync"), cameraOffsetsMs: z.record(z.string(), z.number().finite()).optional(), externalAudioOffsetMs: z.number().finite().nullable().optional() }),
  z.object({ projectId: z.string().uuid(), action: z.literal("remove-source"), sourceId: z.string().trim().min(1).max(80) })
]);

export async function PATCH(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid multicam update." }, { status: 400 });
  const input = parsed.data;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const result = await service.from("video_producer_projects").select("id,status,parent_project_id,source_duration,transcript,edit_plan,director_metadata").eq("id", input.projectId).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Video Producer project was not found." }, { status: 404 });
  const project = result.data;
  if (project.parent_project_id) return NextResponse.json({ error: "Inherited Reels cannot change the parent multicam edit." }, { status: 409 });
  if (project.status === "rendering") return NextResponse.json({ error: "Wait for the current render to finish before changing multicam settings." }, { status: 409 });
  let multicam = getVideoProducerMulticamMetadata(project.director_metadata);
  const cameraIds = multicam.cameras.map((camera) => camera.id);
  const duration = multicam.analysis.primaryDuration ?? project.source_duration ?? 0;
  let locatorToDelete: string | null = null;
  if (input.action === "update-decisions") {
    if (!duration) return NextResponse.json({ error: "Source duration is required before camera decisions can be saved." }, { status: 409 });
    const normalized = normalizeVideoProducerCameraDecisions(input.decisions, duration, cameraIds);
    const unavailable = normalized.find((decision) => decision.sourceId !== VIDEO_PRODUCER_PRIMARY_CAMERA_ID && !Number.isFinite(multicam.analysis.cameraOffsetsMs[decision.sourceId]));
    if (unavailable) return NextResponse.json({ error: `${unavailable.sourceId} is not synced yet.` }, { status: 409 });
    multicam = { ...multicam, editDecisions: normalized };
  } else if (input.action === "regenerate") {
    if (!cameraIds.length) return NextResponse.json({ error: "Add another camera before generating camera cuts." }, { status: 409 });
    if (!duration) return NextResponse.json({ error: "Source duration is required before generating camera cuts." }, { status: 409 });
    const unsynced = cameraIds.filter((id) => !Number.isFinite(multicam.analysis.cameraOffsetsMs[id]));
    if (unsynced.length) return NextResponse.json({ error: "Sync every camera before generating camera cuts." }, { status: 409 });
    multicam = { ...multicam, editDecisions: buildSmartVideoProducerCameraDecisions(project.transcript, duration, cameraIds) };
  } else if (input.action === "manual-sync") {
    const allowedIds = new Set(cameraIds);
    const offsets = { ...multicam.analysis.cameraOffsetsMs };
    for (const [id, value] of Object.entries(input.cameraOffsetsMs || {})) if (allowedIds.has(id)) offsets[id] = value;
    multicam = { ...multicam, analysis: { ...multicam.analysis, status: "ready", error: null, cameraOffsetsMs: offsets, externalAudioOffsetMs: input.externalAudioOffsetMs === undefined ? multicam.analysis.externalAudioOffsetMs : input.externalAudioOffsetMs } };
  } else {
    if (input.sourceId === "external-audio") {
      locatorToDelete = multicam.externalAudio?.locator || null;
      multicam = { ...multicam, externalAudio: null, analysis: { ...multicam.analysis, externalAudioOffsetMs: null, externalAudioConfidence: null, externalAudioDuration: null, waveforms: { ...multicam.analysis.waveforms, "external-audio": [] } } };
    } else {
      const target = multicam.cameras.find((camera) => camera.id === input.sourceId);
      if (!target) return NextResponse.json({ error: "Camera source was not found." }, { status: 404 });
      locatorToDelete = target.locator;
      const { [input.sourceId]: _offset, ...cameraOffsetsMs } = multicam.analysis.cameraOffsetsMs;
      const { [input.sourceId]: _confidence, ...cameraConfidence } = multicam.analysis.cameraConfidence;
      const { [input.sourceId]: _duration, ...cameraDurations } = multicam.analysis.cameraDurations;
      const { [input.sourceId]: _waveform, ...waveforms } = multicam.analysis.waveforms;
      multicam = { ...multicam, cameras: multicam.cameras.filter((camera) => camera.id !== input.sourceId), analysis: { ...multicam.analysis, cameraOffsetsMs, cameraConfidence, cameraDurations, waveforms }, editDecisions: multicam.editDecisions.map((decision) => decision.sourceId === input.sourceId ? { ...decision, sourceId: VIDEO_PRODUCER_PRIMARY_CAMERA_ID } : decision) };
      multicam.editDecisions = normalizeVideoProducerCameraDecisions(multicam.editDecisions, duration, multicam.cameras.map((camera) => camera.id));
    }
  }
  const status = ["approved", "review", "completed"].includes(project.status) && project.edit_plan ? "planned" : project.status;
  const update = await service.from("video_producer_projects").update({ status, director_metadata: withVideoProducerMulticamMetadata(project.director_metadata, multicam), approval_fingerprint: null, approved_at: null, updated_by: access.user.id }).eq("id", project.id).select("director_metadata,status").single();
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  if (locatorToDelete) await deletePrivateVideoProducerBlob(locatorToDelete);
  return NextResponse.json({ ok: true, status: update.data.status, multicam: getVideoProducerMulticamMetadata(update.data.director_metadata) });
}

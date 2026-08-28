import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";
import {
  buildSmartVideoProducerCameraDecisions,
  getVideoProducerMulticamMetadata,
  withVideoProducerMulticamMetadata
} from "@/video-producer-multicam";
import { workerTokenMatches } from "@/video-producer-server";

export const runtime = "nodejs";

const numericRecord = z.record(z.string(), z.number().finite());
const waveformRecord = z.record(z.string(), z.array(z.number().finite()).max(300));
const schema = z.object({
  job_id: z.string().uuid(),
  project_id: z.string().uuid(),
  token: z.string().min(32).max(256),
  status: z.enum(["analyzing", "completed", "failed"]),
  error: z.string().max(3000).optional(),
  camera_offsets_ms: numericRecord.optional(),
  camera_confidence: numericRecord.optional(),
  camera_durations: numericRecord.optional(),
  external_audio_offset_ms: z.number().finite().nullable().optional(),
  external_audio_confidence: z.number().min(0).max(1).nullable().optional(),
  external_audio_duration: z.number().nonnegative().nullable().optional(),
  primary_duration: z.number().nonnegative().optional(),
  waveforms: waveformRecord.optional()
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid multicam callback." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Multicam callback is unavailable." }, { status: 503 });

  const result = await service.from("video_producer_projects")
    .select("id,status,source_duration,transcript,edit_plan,director_metadata")
    .eq("id", parsed.data.project_id)
    .maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Video Producer project was not found." }, { status: 404 });
  const project = result.data;
  const multicam = getVideoProducerMulticamMetadata(project.director_metadata);
  if (multicam.analysis.jobId !== parsed.data.job_id || !multicam.analysis.callbackTokenHash || !workerTokenMatches(parsed.data.token, multicam.analysis.callbackTokenHash)) {
    return NextResponse.json({ error: "Invalid multicam callback token." }, { status: 403 });
  }

  if (parsed.data.status === "analyzing") {
    const next = { ...multicam, analysis: { ...multicam.analysis, status: "analyzing" as const, error: null } };
    const update = await service.from("video_producer_projects").update({
      director_metadata: withVideoProducerMulticamMetadata(project.director_metadata, next)
    }).eq("id", project.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.status === "failed") {
    const next = {
      ...multicam,
      analysis: {
        ...multicam.analysis,
        status: "failed" as const,
        callbackTokenHash: null,
        completedAt: new Date().toISOString(),
        error: parsed.data.error?.trim() || "Waveform sync failed."
      }
    };
    const update = await service.from("video_producer_projects").update({
      director_metadata: withVideoProducerMulticamMetadata(project.director_metadata, next)
    }).eq("id", project.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const cameraIds = new Set(multicam.cameras.map((camera) => camera.id));
  const cameraOffsetsMs = Object.fromEntries(Object.entries(parsed.data.camera_offsets_ms || {}).filter(([id]) => cameraIds.has(id)));
  const cameraConfidence = Object.fromEntries(Object.entries(parsed.data.camera_confidence || {}).filter(([id]) => cameraIds.has(id)).map(([id, value]) => [id, Math.max(0, Math.min(1, value))]));
  const cameraDurations = Object.fromEntries(Object.entries(parsed.data.camera_durations || {}).filter(([id]) => cameraIds.has(id)).map(([id, value]) => [id, Math.max(0, value)]));
  const waveforms = Object.fromEntries(Object.entries(parsed.data.waveforms || {}).filter(([id]) => id === "camera-a" || id === "external-audio" || cameraIds.has(id)));
  const primaryDuration = parsed.data.primary_duration ?? project.source_duration ?? 0;
  const editDecisions = multicam.cameras.length
    ? buildSmartVideoProducerCameraDecisions(project.transcript, primaryDuration, multicam.cameras.map((camera) => camera.id))
    : [];
  const next = {
    ...multicam,
    cameras: multicam.cameras.map((camera) => ({ ...camera, duration: cameraDurations[camera.id] ?? camera.duration ?? null })),
    externalAudio: multicam.externalAudio ? { ...multicam.externalAudio, duration: parsed.data.external_audio_duration ?? multicam.externalAudio.duration ?? null } : multicam.externalAudio,
    analysis: {
      ...multicam.analysis,
      status: "ready" as const,
      callbackTokenHash: null,
      completedAt: new Date().toISOString(),
      error: null,
      cameraOffsetsMs,
      cameraConfidence,
      cameraDurations,
      externalAudioOffsetMs: parsed.data.external_audio_offset_ms ?? null,
      externalAudioConfidence: parsed.data.external_audio_confidence ?? null,
      externalAudioDuration: parsed.data.external_audio_duration ?? null,
      primaryDuration,
      waveforms
    },
    editDecisions
  };
  const status = ["approved", "review", "completed"].includes(project.status) && project.edit_plan ? "planned" : project.status;
  const update = await service.from("video_producer_projects").update({
    status,
    director_metadata: withVideoProducerMulticamMetadata(project.director_metadata, next),
    approval_fingerprint: null,
    approved_at: null
  }).eq("id", project.id);
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

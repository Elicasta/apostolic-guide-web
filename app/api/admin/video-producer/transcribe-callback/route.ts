import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";
import { normalizeVideoProducerTranscript } from "@/video-producer-ai";
import { workerTokenMatches } from "@/video-producer-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  project_id: z.string().uuid(),
  token: z.string().min(32).max(256),
  status: z.enum(["transcribing", "completed", "failed"]),
  progress: z.number().int().min(0).max(100).optional(),
  stage: z.string().min(1).max(100).optional(),
  error: z.string().max(3000).optional(),
  transcript: z.unknown().optional()
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid transcription callback." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Transcription callback is unavailable." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,director_metadata")
    .eq("id", parsed.data.project_id)
    .maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  if (!projectResult.data) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });

  const metadata = projectResult.data.director_metadata && typeof projectResult.data.director_metadata === "object"
    ? projectResult.data.director_metadata as Record<string, unknown>
    : {};
  const bridge = metadata.transcriptionBridge && typeof metadata.transcriptionBridge === "object"
    ? metadata.transcriptionBridge as Record<string, unknown>
    : {};
  if (typeof bridge.callbackTokenHash !== "string" || !workerTokenMatches(parsed.data.token, bridge.callbackTokenHash)) {
    return NextResponse.json({ error: "Invalid transcription token." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const progress = {
    percent: parsed.data.progress ?? (parsed.data.status === "completed" ? 100 : 1),
    stage: parsed.data.stage ?? (parsed.data.status === "completed" ? "Transcript ready" : parsed.data.status === "failed" ? "Transcription failed" : "Transcribing"),
    heartbeatAt: now
  };
  const nextMetadata = { ...metadata, transcriptionProgress: progress };

  if (parsed.data.status === "transcribing") {
    const update = await service.from("video_producer_projects").update({
      status: "transcribing",
      director_metadata: nextMetadata
    }).eq("id", projectResult.data.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.status === "failed") {
    const update = await service.from("video_producer_projects").update({
      status: "failed",
      director_metadata: { ...nextMetadata, transcriptionError: parsed.data.error?.trim() || "Transcription worker failed." }
    }).eq("id", projectResult.data.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const transcript = normalizeVideoProducerTranscript(parsed.data.transcript);
  if (!transcript.words.length || !transcript.text || transcript.duration <= 0) {
    return NextResponse.json({ error: "Completed transcription did not contain usable word timestamps." }, { status: 422 });
  }
  const completedMetadata = {
    ...nextMetadata,
    transcriptionBridge: { ...bridge, callbackTokenHash: null, completedAt: now },
    transcriptionWordCount: transcript.words.length,
    transcriptionSegmentCount: transcript.segments.length
  };
  const update = await service.from("video_producer_projects").update({
    status: "uploaded",
    transcript_text: transcript.text,
    transcript,
    source_duration: transcript.duration,
    edit_plan: null,
    approval_fingerprint: null,
    approved_at: null,
    director_metadata: completedMetadata
  }).eq("id", projectResult.data.id);
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, wordCount: transcript.words.length, duration: transcript.duration });
}

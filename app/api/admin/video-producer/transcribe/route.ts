import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import {
  createPrivateBlobDownloadUrl,
  createWorkerCallbackToken,
  dispatchVideoProducerWorker,
  videoProducerRendererCredentials,
  videoProducerWorkerRef
} from "@/video-producer-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({ projectId: z.string().uuid() });

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid transcription request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,title,source_provider,source_locator,source_filename,director_metadata")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project?.source_locator) return NextResponse.json({ error: "Upload the source video before transcribing." }, { status: 409 });
  if (project.source_provider !== "vercel_blob") return NextResponse.json({ error: "This source provider is not supported by the transcription worker yet." }, { status: 409 });

  let githubToken = "";
  let repository = "";
  try {
    ({ token: githubToken, repository } = await videoProducerRendererCredentials(service));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Worker credentials could not be loaded." }, { status: 500 });
  }
  if (!githubToken) return NextResponse.json({ error: "Video worker is not connected. Configure the existing Video Studio GitHub token first." }, { status: 503 });

  const metadata = project.director_metadata && typeof project.director_metadata === "object"
    ? project.director_metadata as Record<string, unknown>
    : {};

  try {
    const sourceUrl = await createPrivateBlobDownloadUrl(project.source_locator, 4 * 60 * 60 * 1000);
    const callback = createWorkerCallbackToken();
    const now = new Date().toISOString();
    const workerRef = videoProducerWorkerRef();
    const nextMetadata = {
      ...metadata,
      transcriptionError: null,
      transcriptionBridge: {
        callbackTokenHash: callback.hash,
        dispatchedAt: now,
        model: "whisper-1",
        sourceLocator: project.source_locator,
        workerRef
      }
    };
    const update = await service.from("video_producer_projects").update({
      status: "transcribing",
      transcript_text: null,
      transcript: { words: [], segments: [] },
      edit_plan: null,
      approval_fingerprint: null,
      approved_at: null,
      director_metadata: nextMetadata,
      updated_by: access.user.id
    }).eq("id", project.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });

    await dispatchVideoProducerWorker({
      token: githubToken,
      repository,
      eventType: "video-producer-transcribe",
      payload: {
        project_id: project.id,
        worker_ref: workerRef,
        source_url: sourceUrl,
        source_filename: project.source_filename || "source.mp4",
        callback_url: `${new URL(request.url).origin}/api/admin/video-producer/transcribe-callback`,
        callback_token: callback.token,
        transcription_model: "whisper-1"
      }
    });
    return NextResponse.json({ ok: true, projectId: project.id, status: "transcribing", workerRef });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription worker could not be dispatched.";
    await service.from("video_producer_projects").update({
      status: "failed",
      director_metadata: { ...metadata, transcriptionError: message, transcriptionFailedAt: new Date().toISOString() },
      updated_by: access.user.id
    }).eq("id", project.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

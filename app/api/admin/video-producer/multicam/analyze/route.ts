import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { getVideoProducerMulticamMetadata, withVideoProducerMulticamMetadata } from "@/video-producer-multicam";
import {
  createPrivateBlobDownloadUrl,
  createWorkerCallbackToken,
  dispatchVideoProducerWorker,
  videoProducerRendererCredentials,
  videoProducerWorkerRef
} from "@/video-producer-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ projectId: z.string().uuid() });
const DEFAULT_PUBLIC_CALLBACK_ORIGIN = "https://apostolic-guide-web.vercel.app";

function callbackOrigin(request: Request) {
  const configured = process.env.VIDEO_PRODUCER_CALLBACK_ORIGIN?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const origin = new URL(request.url).origin;
  return process.env.VERCEL_ENV === "preview" ? DEFAULT_PUBLIC_CALLBACK_ORIGIN : origin;
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid multicam sync request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const result = await service.from("video_producer_projects")
    .select("id,status,parent_project_id,source_provider,source_locator,source_duration,director_metadata")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  const project = result.data;
  if (!project) return NextResponse.json({ error: "Video Producer project was not found." }, { status: 404 });
  if (project.parent_project_id) return NextResponse.json({ error: "Inherited Reels use the parent camera edit and cannot run a separate multicam sync." }, { status: 409 });
  if (project.source_provider !== "vercel_blob" || !project.source_locator) return NextResponse.json({ error: "Upload Camera A before syncing other media." }, { status: 409 });
  if (project.status === "rendering") return NextResponse.json({ error: "Wait for the current render to finish before changing sync." }, { status: 409 });

  const multicam = getVideoProducerMulticamMetadata(project.director_metadata);
  if (!multicam.cameras.length && !multicam.externalAudio) return NextResponse.json({ error: "Add another camera or external audio before syncing." }, { status: 409 });

  let githubToken = "";
  let repository = "";
  try { ({ token: githubToken, repository } = await videoProducerRendererCredentials(service)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Worker credentials could not be loaded." }, { status: 500 }); }
  if (!githubToken) return NextResponse.json({ error: "Video worker is not connected." }, { status: 503 });

  const jobId = randomUUID();
  const callback = createWorkerCallbackToken();
  const queued = {
    ...multicam,
    analysis: {
      status: "queued" as const,
      jobId,
      callbackTokenHash: callback.hash,
      requestedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
      cameraOffsetsMs: {},
      cameraConfidence: {},
      cameraDurations: {},
      waveforms: {}
    }
  };
  const saved = await service.from("video_producer_projects").update({
    director_metadata: withVideoProducerMulticamMetadata(project.director_metadata, queued),
    approval_fingerprint: null,
    approved_at: null,
    updated_by: access.user.id
  }).eq("id", project.id);
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  try {
    const primaryUrl = await createPrivateBlobDownloadUrl(project.source_locator, 3 * 60 * 60 * 1000);
    const cameraSources = await Promise.all(multicam.cameras.map(async (camera) => ({
      id: camera.id,
      label: camera.label,
      url: await createPrivateBlobDownloadUrl(camera.locator, 3 * 60 * 60 * 1000)
    })));
    const externalAudioUrl = multicam.externalAudio
      ? await createPrivateBlobDownloadUrl(multicam.externalAudio.locator, 3 * 60 * 60 * 1000)
      : null;
    await dispatchVideoProducerWorker({
      token: githubToken,
      repository,
      eventType: "video-producer-multicam-analyze",
      payload: {
        job_id: jobId,
        project_id: project.id,
        worker_ref: videoProducerWorkerRef(),
        primary_url: primaryUrl,
        cameras: cameraSources,
        external_audio_url: externalAudioUrl,
        callback_url: `${callbackOrigin(request)}/api/admin/video-producer/multicam/callback`,
        callback_token: callback.token
      }
    });
    return NextResponse.json({ ok: true, jobId, cameraCount: multicam.cameras.length, hasExternalAudio: Boolean(multicam.externalAudio) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Multicam analysis could not be queued.";
    const failed = { ...queued, analysis: { ...queued.analysis, status: "failed" as const, callbackTokenHash: null, error: message } };
    await service.from("video_producer_projects").update({ director_metadata: withVideoProducerMulticamMetadata(project.director_metadata, failed) }).eq("id", project.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

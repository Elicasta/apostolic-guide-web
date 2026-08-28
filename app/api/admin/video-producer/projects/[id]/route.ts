import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { normalizeVideoProducerTranscript, sliceVideoProducerTranscript } from "@/video-producer-ai";
import { reconcileVideoProducerWorkerState } from "@/video-producer-job-recovery";
import { getVideoProducerMulticamMetadata } from "@/video-producer-multicam";
import { createPrivateBlobDownloadUrl } from "@/video-producer-server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid project id." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const activeResult = await service.from("video_producer_projects").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (activeResult.error) return NextResponse.json({ error: activeResult.error.message }, { status: 500 });
  if (!activeResult.data) return NextResponse.json({ error: "Video Producer project is in the Recovery Bucket or no longer exists." }, { status: 404 });

  await reconcileVideoProducerWorkerState(service, id);

  const [projectResult, rendersResult] = await Promise.all([
    service.from("video_producer_projects").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    service.from("video_producer_renders").select("id,status,progress,output_storage_path,error,requested_at,started_at,completed_at").eq("project_id", id).order("requested_at", { ascending: false }).limit(20)
  ]);
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  if (rendersResult.error) return NextResponse.json({ error: rendersResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });

  const transcript = normalizeVideoProducerTranscript(project.transcript);
  const localTranscript = project.source_range_start != null && project.source_range_end != null
    ? sliceVideoProducerTranscript(transcript, Number(project.source_range_start), Number(project.source_range_end))
    : transcript;
  const multicam = getVideoProducerMulticamMetadata(project.director_metadata);
  let sourcePreviewUrl: string | null = null;
  let renderPreviewUrl: string | null = null;
  const cameraPreviewUrls: Record<string, string> = {};
  let externalAudioPreviewUrl: string | null = null;
  try {
    if (project.source_provider === "vercel_blob" && project.source_locator) {
      sourcePreviewUrl = await createPrivateBlobDownloadUrl(project.source_locator, 30 * 60 * 1000);
    }
    await Promise.all(multicam.cameras.map(async (camera) => {
      cameraPreviewUrls[camera.id] = await createPrivateBlobDownloadUrl(camera.locator, 30 * 60 * 1000);
    }));
    if (multicam.externalAudio) externalAudioPreviewUrl = await createPrivateBlobDownloadUrl(multicam.externalAudio.locator, 30 * 60 * 1000);
    const completed = (rendersResult.data ?? []).find((render) => render.status === "completed" && render.output_storage_path);
    if (completed?.output_storage_path) renderPreviewUrl = await createPrivateBlobDownloadUrl(completed.output_storage_path, 30 * 60 * 1000);
  } catch (error) {
    console.error("Video Producer preview signing failed", error);
  }
  return NextResponse.json({
    project: { ...project, transcript_local_text: localTranscript.text, transcript_local_duration: localTranscript.duration },
    renders: rendersResult.data ?? [],
    sourcePreviewUrl,
    renderPreviewUrl,
    multicamPreview: { cameraPreviewUrls, externalAudioPreviewUrl }
  });
}

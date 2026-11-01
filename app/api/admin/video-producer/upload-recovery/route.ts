import { head } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { isVideoProducerWorkerStale, VIDEO_PRODUCER_UPLOAD_STALE_MS } from "@/video-producer-job-state";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({ projectId: z.string().uuid() });

function isBlobNotFound(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "BlobNotFoundError" || /blob.*not found|not found.*blob/i.test(error.message);
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload recovery request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const projectResult = await service.from("video_producer_projects")
    .select("id,status,parent_project_id,source_provider,source_locator,source_filename,source_mime_type,source_size_bytes,director_metadata,updated_at")
    .eq("id", parsed.data.projectId)
    .maybeSingle();
  if (projectResult.error) return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  const project = projectResult.data;
  if (!project) return NextResponse.json({ error: "Video Producer project not found." }, { status: 404 });
  if (project.parent_project_id) return NextResponse.json({ error: "Inherited reel sources cannot be reconciled as uploads." }, { status: 409 });
  if (project.status !== "uploading") {
    return NextResponse.json({ state: project.status === "uploaded" ? "uploaded" : "unchanged", status: project.status });
  }

  const metadata = project.director_metadata && typeof project.director_metadata === "object"
    ? project.director_metadata as Record<string, unknown>
    : {};
  const recoveredAt = new Date().toISOString();

  if (project.source_provider !== "vercel_blob" || !project.source_locator) {
    const reset = await service.from("video_producer_projects").update({
      status: "draft",
      source_provider: null,
      source_locator: null,
      source_filename: null,
      source_mime_type: null,
      source_size_bytes: null,
      source_duration: null,
      transcript_text: null,
      transcript: { words: [], segments: [] },
      edit_plan: null,
      approval_fingerprint: null,
      approved_at: null,
      director_metadata: { ...metadata, uploadRecovery: { state: "reset", recoveredAt, reason: "missing provisional source locator" } },
      updated_by: access.user.id
    }).eq("id", project.id).select("status").single();
    if (reset.error) return NextResponse.json({ error: reset.error.message }, { status: 500 });
    return NextResponse.json({ state: "reset", status: reset.data.status });
  }

  try {
    const blob = await head(project.source_locator);
    const blobRecord = blob as unknown as { pathname?: string; size?: number; contentType?: string };
    if (blobRecord.pathname && blobRecord.pathname !== project.source_locator) {
      return NextResponse.json({ error: "Recovered Blob path does not match the project source." }, { status: 409 });
    }
    const completed = await service.from("video_producer_projects").update({
      status: "uploaded",
      source_size_bytes: Number.isFinite(blobRecord.size) ? Math.round(blobRecord.size as number) : project.source_size_bytes,
      source_mime_type: blobRecord.contentType || project.source_mime_type,
      director_metadata: { ...metadata, uploadRecovery: { state: "completed", recoveredAt } },
      updated_by: access.user.id
    }).eq("id", project.id).select("status,source_size_bytes,source_mime_type").single();
    if (completed.error) return NextResponse.json({ error: completed.error.message }, { status: 500 });
    return NextResponse.json({ state: "uploaded", status: completed.data.status, source: completed.data });
  } catch (error) {
    if (!isBlobNotFound(error)) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Private media storage could not be checked." }, { status: 502 });
    }

    if (!isVideoProducerWorkerStale(project.updated_at, VIDEO_PRODUCER_UPLOAD_STALE_MS)) {
      return NextResponse.json({ state: "pending", status: "uploading" });
    }

    const reset = await service.from("video_producer_projects").update({
      status: "draft",
      source_provider: null,
      source_locator: null,
      source_filename: null,
      source_mime_type: null,
      source_size_bytes: null,
      source_duration: null,
      transcript_text: null,
      transcript: { words: [], segments: [] },
      edit_plan: null,
      approval_fingerprint: null,
      approved_at: null,
      director_metadata: { ...metadata, uploadRecovery: { state: "reset", recoveredAt, reason: "stale upload with no completed blob" } },
      updated_by: access.user.id
    }).eq("id", project.id).select("status").single();
    if (reset.error) return NextResponse.json({ error: reset.error.message }, { status: 500 });
    return NextResponse.json({ state: "reset", status: reset.data.status });
  }
}

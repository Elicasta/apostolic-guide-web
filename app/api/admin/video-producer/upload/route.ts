import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { getVideoProducerMulticamMetadata, withVideoProducerMulticamMetadata } from "@/video-producer-multicam";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SOURCE_BYTES = 20 * 1024 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = [
  "video/mp4", "video/quicktime", "video/x-m4v", "video/webm", "video/mpeg", "video/x-msvideo"
];
const ALLOWED_AUDIO_TYPES = [
  "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/flac", "audio/x-flac", "audio/webm"
];

type SourceKind = "primary_camera" | "camera" | "external_audio";
type UploadPayload = {
  projectId: string;
  userId: string;
  filename: string;
  contentType: string;
  size: number;
  sourceKind?: SourceKind;
  sourceId?: string;
  sourceLabel?: string;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "source.mp4";
}

function safeId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function sourcePath(payload: Omit<UploadPayload, "userId">) {
  const kind = payload.sourceKind || "primary_camera";
  if (kind === "camera") {
    const id = safeId(payload.sourceId || "");
    if (!id || id === "camera-a") throw new Error("Secondary camera id is invalid.");
    return `video-producer/sources/${payload.projectId}/cameras/${id}/${safeName(payload.filename)}`;
  }
  if (kind === "external_audio") return `video-producer/sources/${payload.projectId}/external-audio/${safeName(payload.filename)}`;
  return `video-producer/sources/${payload.projectId}/${safeName(payload.filename)}`;
}

function resetAnalysis(multicam: ReturnType<typeof getVideoProducerMulticamMetadata>) {
  return {
    ...multicam,
    analysis: {
      status: "idle" as const,
      cameraOffsetsMs: {},
      cameraConfidence: {},
      cameraDurations: {},
      waveforms: {}
    },
    editDecisions: []
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({
      error: "Private media storage is not connected yet. Connect the Video Producer Vercel Blob store before uploading source media."
    }, { status: 503 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { access, allowed } = await getStudioPermission("manage_content");
        if (!allowed || access.state !== "allowed" || !access.user) throw new Error("Forbidden");
        let payload: Omit<UploadPayload, "userId">;
        try { payload = JSON.parse(clientPayload || "{}") as Omit<UploadPayload, "userId">; }
        catch { throw new Error("Invalid upload payload."); }
        if (!payload.projectId || !payload.filename || !payload.contentType || !Number.isFinite(payload.size)) throw new Error("Incomplete upload payload.");
        const kind = payload.sourceKind || "primary_camera";
        if (kind === "external_audio") {
          if (!ALLOWED_AUDIO_TYPES.includes(payload.contentType)) throw new Error("Unsupported external audio type.");
        } else if (!ALLOWED_VIDEO_TYPES.includes(payload.contentType)) throw new Error("Unsupported video type.");
        if (payload.size <= 0 || payload.size > MAX_SOURCE_BYTES) throw new Error("Source must be between 1 byte and 20 GB.");

        const expectedPath = sourcePath(payload);
        if (pathname !== expectedPath) throw new Error("Upload path does not match the project.");
        const service = createServiceClient();
        if (!service) throw new Error("Supabase service access is not configured.");
        const project = await service.from("video_producer_projects").select("id,parent_project_id").eq("id", payload.projectId).maybeSingle();
        if (project.error) throw new Error(project.error.message);
        if (!project.data) throw new Error("Video Producer project was not found.");
        if (project.data.parent_project_id) throw new Error("A reel inherited from a podcast cannot replace or add source media.");

        if (kind === "primary_camera") {
          const update = await service.from("video_producer_projects").update({
            status: "uploading",
            source_provider: "vercel_blob",
            source_locator: expectedPath,
            source_filename: payload.filename,
            source_mime_type: payload.contentType,
            source_size_bytes: Math.round(payload.size),
            edit_plan: null,
            director_metadata: {},
            approval_fingerprint: null,
            approved_at: null,
            updated_by: access.user.id
          }).eq("id", payload.projectId);
          if (update.error) throw new Error(update.error.message);
        }

        return {
          allowedContentTypes: [payload.contentType],
          maximumSizeInBytes: MAX_SOURCE_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ ...payload, sourceKind: kind, userId: access.user.id } satisfies UploadPayload)
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: UploadPayload;
        try { payload = JSON.parse(tokenPayload || "{}") as UploadPayload; }
        catch { throw new Error("Invalid upload completion payload."); }
        const kind = payload.sourceKind || "primary_camera";
        const expectedPath = sourcePath(payload);
        if (blob.pathname !== expectedPath) throw new Error("Completed blob path does not match the project.");
        const service = createServiceClient();
        if (!service) throw new Error("Supabase service access is not configured.");

        if (kind === "primary_camera") {
          const update = await service.from("video_producer_projects").update({
            status: "uploaded",
            source_provider: "vercel_blob",
            source_locator: blob.pathname,
            source_filename: payload.filename,
            source_mime_type: payload.contentType,
            source_size_bytes: Math.round(payload.size),
            updated_by: payload.userId
          }).eq("id", payload.projectId);
          if (update.error) throw new Error(update.error.message);
          return;
        }

        const current = await service.from("video_producer_projects")
          .select("id,status,edit_plan,director_metadata")
          .eq("id", payload.projectId)
          .maybeSingle();
        if (current.error) throw new Error(current.error.message);
        if (!current.data) throw new Error("Video Producer project was not found.");
        let multicam = resetAnalysis(getVideoProducerMulticamMetadata(current.data.director_metadata));
        if (kind === "camera") {
          const id = safeId(payload.sourceId || "");
          const existing = multicam.cameras.filter((camera) => camera.id !== id);
          const label = payload.sourceLabel?.trim().slice(0, 60) || `Camera ${String.fromCharCode(65 + existing.length + 1)}`;
          multicam = {
            ...multicam,
            cameras: [...existing, {
              id,
              label,
              provider: "vercel_blob",
              locator: blob.pathname,
              filename: payload.filename,
              mimeType: payload.contentType,
              sizeBytes: Math.round(payload.size),
              duration: null
            }]
          };
        } else {
          multicam = {
            ...multicam,
            externalAudio: {
              provider: "vercel_blob",
              locator: blob.pathname,
              filename: payload.filename,
              mimeType: payload.contentType,
              sizeBytes: Math.round(payload.size),
              duration: null
            }
          };
        }
        const status = ["approved", "review", "completed"].includes(current.data.status) && current.data.edit_plan ? "planned" : current.data.status;
        const update = await service.from("video_producer_projects").update({
          status,
          director_metadata: withVideoProducerMulticamMetadata(current.data.director_metadata, multicam),
          approval_fingerprint: null,
          approved_at: null,
          updated_by: payload.userId
        }).eq("id", payload.projectId);
        if (update.error) throw new Error(update.error.message);
      }
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video source upload could not be prepared.";
    const status = message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

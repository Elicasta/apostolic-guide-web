import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MEDIA_BYTES = 20 * 1024 * 1024 * 1024;
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-m4v", "video/webm", "video/mpeg", "video/x-msvideo"]);
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/flac", "audio/ogg"]);

type MediaUploadPayload = {
  projectId: string;
  assetId: string;
  role: "camera_b" | "external_audio";
  userId: string;
  filename: string;
  contentType: string;
  size: number;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "media";
}

function allowedType(role: MediaUploadPayload["role"], contentType: string) {
  return role === "camera_b" ? VIDEO_TYPES.has(contentType) : AUDIO_TYPES.has(contentType);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Invalid media upload request." }, { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) return NextResponse.json({ error: "Private media storage is not connected." }, { status: 503 });

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { access, allowed } = await getStudioPermission("manage_content");
        if (!allowed || access.state !== "allowed" || !access.user) throw new Error("Forbidden");
        let payload: Omit<MediaUploadPayload, "userId">;
        try { payload = JSON.parse(clientPayload || "{}") as Omit<MediaUploadPayload, "userId">; }
        catch { throw new Error("Invalid optional-media payload."); }
        if (!payload.projectId || !payload.assetId || !/^[0-9a-f-]{36}$/i.test(payload.assetId)) throw new Error("Invalid project or asset id.");
        if (payload.role !== "camera_b" && payload.role !== "external_audio") throw new Error("Unsupported media role.");
        if (!payload.filename || !payload.contentType || !allowedType(payload.role, payload.contentType)) throw new Error("Unsupported media type for this role.");
        if (!Number.isFinite(payload.size) || payload.size <= 0 || payload.size > MAX_MEDIA_BYTES) throw new Error("Optional media must be between 1 byte and 20 GB.");
        const expected = `video-producer/media/${payload.projectId}/${payload.role}/${payload.assetId}/${safeName(payload.filename)}`;
        if (pathname !== expected) throw new Error("Optional-media path does not match the project.");

        const service = createServiceClient();
        if (!service) throw new Error("Supabase service access is not configured.");
        const project = await service.from("video_producer_projects").select("id,parent_project_id,deleted_at").eq("id", payload.projectId).maybeSingle();
        if (project.error) throw new Error(project.error.message);
        if (!project.data || project.data.deleted_at) throw new Error("Video Producer project was not found.");
        if (project.data.parent_project_id) throw new Error("Add Camera B or External Audio to the parent Podcast, not an inherited Reel.");

        const pending = await service.from("video_producer_media_assets").upsert({
          id: payload.assetId,
          project_id: payload.projectId,
          role: payload.role,
          storage_provider: "vercel_blob",
          storage_locator: expected,
          filename: payload.filename,
          mime_type: payload.contentType,
          size_bytes: Math.round(payload.size),
          sync_status: "uploading",
          sync_method: null,
          offset_seconds: null,
          sync_confidence: null,
          sync_metadata: {},
          active: false,
          created_by: access.user.id,
          updated_by: access.user.id
        }, { onConflict: "id" });
        if (pending.error) throw new Error(pending.error.message);
        return {
          allowedContentTypes: [payload.contentType],
          maximumSizeInBytes: MAX_MEDIA_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ ...payload, userId: access.user.id } satisfies MediaUploadPayload)
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: MediaUploadPayload;
        try { payload = JSON.parse(tokenPayload || "{}") as MediaUploadPayload; }
        catch { throw new Error("Invalid optional-media completion payload."); }
        const expected = `video-producer/media/${payload.projectId}/${payload.role}/${payload.assetId}/${safeName(payload.filename)}`;
        if (blob.pathname !== expected) throw new Error("Completed optional-media path does not match the project.");
        const service = createServiceClient();
        if (!service) throw new Error("Supabase service access is not configured.");

        const deactivate = await service.from("video_producer_media_assets")
          .update({ active: false, updated_by: payload.userId })
          .eq("project_id", payload.projectId).eq("role", payload.role).eq("active", true).neq("id", payload.assetId);
        if (deactivate.error) throw new Error(deactivate.error.message);
        const activated = await service.from("video_producer_media_assets").update({
          active: true,
          sync_status: "analyzing",
          storage_locator: blob.pathname,
          updated_by: payload.userId
        }).eq("id", payload.assetId);
        if (activated.error) throw new Error(activated.error.message);

        const project = await service.from("video_producer_projects").select("id,media_revision,edit_plan").eq("id", payload.projectId).maybeSingle();
        if (project.error) throw new Error(project.error.message);
        const revision = Math.max(1, Number(project.data?.media_revision || 1)) + 1;
        const update = await service.from("video_producer_projects").update({
          media_revision: revision,
          camera_plan: null,
          approval_fingerprint: null,
          approved_at: null,
          status: project.data?.edit_plan ? "planned" : "uploaded",
          updated_by: payload.userId
        }).eq("id", payload.projectId);
        if (update.error) throw new Error(update.error.message);
        await service.from("video_producer_projects").update({
          camera_plan: null,
          approval_fingerprint: null,
          approved_at: null,
          updated_by: payload.userId
        }).eq("parent_project_id", payload.projectId).is("deleted_at", null);
      }
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Optional media upload could not be prepared.";
    return NextResponse.json({ error: message }, { status: message === "Forbidden" ? 403 : 400 });
  }
}

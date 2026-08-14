import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SOURCE_BYTES = 20 * 1024 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = [
  "video/mp4", "video/quicktime", "video/x-m4v", "video/webm", "video/mpeg", "video/x-msvideo"
];

type UploadPayload = {
  projectId: string;
  userId: string;
  filename: string;
  contentType: string;
  size: number;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "source.mp4";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({
      error: "Private media storage is not connected yet. Connect the Video Producer Vercel Blob store before uploading a source video."
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
        if (!ALLOWED_VIDEO_TYPES.includes(payload.contentType)) throw new Error("Unsupported video type.");
        if (payload.size <= 0 || payload.size > MAX_SOURCE_BYTES) throw new Error("Source must be between 1 byte and 20 GB.");

        const expectedPath = `video-producer/sources/${payload.projectId}/${safeName(payload.filename)}`;
        if (pathname !== expectedPath) throw new Error("Upload path does not match the project.");
        const service = createServiceClient();
        if (!service) throw new Error("Supabase service access is not configured.");
        const project = await service.from("video_producer_projects").select("id,parent_project_id").eq("id", payload.projectId).maybeSingle();
        if (project.error) throw new Error(project.error.message);
        if (!project.data) throw new Error("Video Producer project was not found.");
        if (project.data.parent_project_id) throw new Error("A reel inherited from a podcast cannot replace the parent source.");
        const update = await service.from("video_producer_projects").update({
          status: "uploading",
          source_provider: "vercel_blob",
          source_locator: expectedPath,
          source_filename: payload.filename,
          source_mime_type: payload.contentType,
          source_size_bytes: Math.round(payload.size),
          edit_plan: null,
          approval_fingerprint: null,
          approved_at: null,
          updated_by: access.user.id
        }).eq("id", payload.projectId);
        if (update.error) throw new Error(update.error.message);

        return {
          allowedContentTypes: [payload.contentType],
          maximumSizeInBytes: MAX_SOURCE_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ ...payload, userId: access.user.id } satisfies UploadPayload)
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: UploadPayload;
        try { payload = JSON.parse(tokenPayload || "{}") as UploadPayload; }
        catch { throw new Error("Invalid upload completion payload."); }
        const expectedPath = `video-producer/sources/${payload.projectId}/${safeName(payload.filename)}`;
        if (blob.pathname !== expectedPath) throw new Error("Completed blob path does not match the project.");
        const service = createServiceClient();
        if (!service) throw new Error("Supabase service access is not configured.");
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
      }
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video source upload could not be prepared.";
    const status = message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

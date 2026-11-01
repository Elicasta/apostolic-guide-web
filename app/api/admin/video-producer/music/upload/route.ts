import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MUSIC_BYTES = 500 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave",
  "audio/mp4", "audio/x-m4a", "audio/aac", "audio/flac", "audio/x-flac"
];

type MusicUploadPayload = {
  trackId: string;
  userId: string;
  title: string;
  sourceProvider: "upload" | "suno";
  sourceUrl?: string;
  mood?: string;
  filename: string;
  contentType: string;
  size: number;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "music.mp3";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) return NextResponse.json({ error: "Private media storage is not connected." }, { status: 503 });

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { access, allowed } = await getStudioPermission("manage_content");
        if (!allowed || access.state !== "allowed" || !access.user) throw new Error("Forbidden");
        let payload: Omit<MusicUploadPayload, "userId">;
        try { payload = JSON.parse(clientPayload || "{}") as Omit<MusicUploadPayload, "userId">; }
        catch { throw new Error("Invalid music upload payload."); }
        if (!payload.trackId || !payload.title?.trim() || !payload.filename || !payload.contentType || !Number.isFinite(payload.size)) throw new Error("Incomplete music upload payload.");
        if (!ALLOWED_AUDIO_TYPES.includes(payload.contentType)) throw new Error("Unsupported audio type. Upload MP3, WAV, M4A, AAC or FLAC.");
        if (payload.size <= 0 || payload.size > MAX_MUSIC_BYTES) throw new Error("Music file must be between 1 byte and 500 MB.");
        if (payload.sourceProvider !== "upload" && payload.sourceProvider !== "suno") throw new Error("Unsupported music source.");
        const expected = `video-producer/music/${payload.trackId}/${safeName(payload.filename)}`;
        if (pathname !== expected) throw new Error("Music upload path is invalid.");
        return {
          allowedContentTypes: [payload.contentType],
          maximumSizeInBytes: MAX_MUSIC_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ ...payload, title: payload.title.trim(), userId: access.user.id } satisfies MusicUploadPayload)
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: MusicUploadPayload;
        try { payload = JSON.parse(tokenPayload || "{}") as MusicUploadPayload; }
        catch { throw new Error("Invalid music completion payload."); }
        const expected = `video-producer/music/${payload.trackId}/${safeName(payload.filename)}`;
        if (blob.pathname !== expected) throw new Error("Completed music path is invalid.");
        const service = createServiceClient();
        if (!service) throw new Error("Supabase service access is not configured.");
        const upsert = await service.from("video_producer_music_tracks").upsert({
          id: payload.trackId,
          title: payload.title,
          source_provider: payload.sourceProvider,
          source_url: payload.sourceUrl?.trim() || null,
          storage_provider: "vercel_blob",
          storage_locator: blob.pathname,
          filename: payload.filename,
          content_type: payload.contentType,
          size_bytes: Math.round(payload.size),
          mood: payload.mood?.trim() || null,
          active: true,
          created_by: payload.userId,
          updated_by: payload.userId,
          updated_at: new Date().toISOString()
        }, { onConflict: "id" });
        if (upsert.error) throw new Error(upsert.error.message);
      }
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Music upload could not be prepared.";
    return NextResponse.json({ error: message }, { status: message === "Forbidden" ? 403 : 400 });
  }
}

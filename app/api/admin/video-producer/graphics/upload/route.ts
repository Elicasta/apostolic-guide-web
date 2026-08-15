import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_GRAPHIC_BYTES = 25 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/webp"];
const KINDS = new Set(["logo", "scripture-frame", "pathway-frame", "lower-third", "statement", "cta", "texture", "overlay", "other"]);

type GraphicUploadPayload = {
  assetId: string;
  userId: string;
  title: string;
  kind: string;
  tags: string[];
  notes?: string;
  filename: string;
  contentType: string;
  size: number;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "graphic.png";
}
function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean).slice(0, 20).map((item) => item.slice(0, 48));
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
        let payload: Omit<GraphicUploadPayload, "userId">;
        try { payload = JSON.parse(clientPayload || "{}") as Omit<GraphicUploadPayload, "userId">; }
        catch { throw new Error("Invalid graphic upload payload."); }
        if (!payload.assetId || !payload.title?.trim() || !payload.filename || !payload.contentType || !Number.isFinite(payload.size)) throw new Error("Incomplete graphic upload payload.");
        if (!KINDS.has(payload.kind)) throw new Error("Unknown graphic asset type.");
        if (!ALLOWED_IMAGE_TYPES.includes(payload.contentType)) throw new Error("Upload a PNG or WebP graphic.");
        if (payload.size <= 0 || payload.size > MAX_GRAPHIC_BYTES) throw new Error("Graphic file must be between 1 byte and 25 MB.");
        const expected = `video-producer/graphics/${payload.assetId}/${safeName(payload.filename)}`;
        if (pathname !== expected) throw new Error("Graphic upload path is invalid.");
        return {
          allowedContentTypes: [payload.contentType],
          maximumSizeInBytes: MAX_GRAPHIC_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            ...payload,
            title: payload.title.trim().slice(0, 160),
            tags: cleanTags(payload.tags),
            notes: payload.notes?.trim().slice(0, 500) || undefined,
            userId: access.user.id
          } satisfies GraphicUploadPayload)
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: GraphicUploadPayload;
        try { payload = JSON.parse(tokenPayload || "{}") as GraphicUploadPayload; }
        catch { throw new Error("Invalid graphic completion payload."); }
        const expected = `video-producer/graphics/${payload.assetId}/${safeName(payload.filename)}`;
        if (blob.pathname !== expected) throw new Error("Completed graphic path is invalid.");
        const service = createServiceClient();
        if (!service) throw new Error("Supabase service access is not configured.");
        const upsert = await service.from("video_producer_graphic_assets").upsert({
          id: payload.assetId,
          title: payload.title,
          kind: payload.kind,
          storage_provider: "vercel_blob",
          storage_locator: blob.pathname,
          filename: payload.filename,
          content_type: payload.contentType,
          size_bytes: Math.round(payload.size),
          tags: payload.tags,
          notes: payload.notes || null,
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
    const message = error instanceof Error ? error.message : "Graphic upload could not be prepared.";
    return NextResponse.json({ error: message }, { status: message === "Forbidden" ? 403 : 400 });
  }
}

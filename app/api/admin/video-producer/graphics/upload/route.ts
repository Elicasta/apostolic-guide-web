import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import {
  normalizeVideoProducerGraphicAssetAttributes,
  videoProducerGraphicAssetPersistence,
  type VideoProducerGraphicAssetAttributes
} from "@/video-producer-graphic-assets";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_GRAPHIC_BYTES = 25 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/webp"];

type GraphicUploadPayload = VideoProducerGraphicAssetAttributes & {
  assetId: string;
  userId: string;
  title: string;
  tags: string[];
  filename: string;
  contentType: string;
  size: number;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "graphic.png";
}

function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(
    value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
  )).slice(0, 20).map((item) => item.slice(0, 48));
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

        let raw: Record<string, unknown>;
        try { raw = JSON.parse(clientPayload || "{}") as Record<string, unknown>; }
        catch { throw new Error("Invalid graphic upload payload."); }

        const assetId = String(raw.assetId || "");
        const title = String(raw.title || "").trim();
        const filename = String(raw.filename || "");
        const contentType = String(raw.contentType || "");
        const size = Number(raw.size);
        if (!assetId || !title || !filename || !contentType || !Number.isFinite(size)) throw new Error("Incomplete graphic upload payload.");
        if (!ALLOWED_IMAGE_TYPES.includes(contentType)) throw new Error("Upload a PNG or WebP graphic.");
        if (size <= 0 || size > MAX_GRAPHIC_BYTES) throw new Error("Graphic file must be between 1 byte and 25 MB.");

        const expected = `video-producer/graphics/${assetId}/${safeName(filename)}`;
        if (pathname !== expected) throw new Error("Graphic upload path is invalid.");

        const attributes = normalizeVideoProducerGraphicAssetAttributes({
          assetType: raw.assetType,
          formats: raw.formats,
          textBehavior: raw.textBehavior,
          maxLines: raw.maxLines,
          alignment: raw.alignment,
          referenceZone: raw.referenceZone,
          displayBehavior: raw.displayBehavior,
          fixedText: raw.fixedText,
          notes: raw.notes
        });

        return {
          allowedContentTypes: [contentType],
          maximumSizeInBytes: MAX_GRAPHIC_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            assetId,
            title: title.slice(0, 160),
            tags: cleanTags(raw.tags),
            filename: filename.slice(0, 255),
            contentType,
            size,
            userId: access.user.id,
            ...attributes
          } satisfies GraphicUploadPayload)
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: GraphicUploadPayload;
        try { payload = JSON.parse(tokenPayload || "{}") as GraphicUploadPayload; }
        catch { throw new Error("Invalid graphic completion payload."); }

        const expected = `video-producer/graphics/${payload.assetId}/${safeName(payload.filename)}`;
        if (blob.pathname !== expected) throw new Error("Completed graphic path is invalid.");

        const attributes = normalizeVideoProducerGraphicAssetAttributes(payload);
        const service = createServiceClient();
        if (!service) throw new Error("Supabase service access is not configured.");

        const upsert = await service.from("video_producer_graphic_assets").upsert({
          id: payload.assetId,
          title: payload.title,
          ...videoProducerGraphicAssetPersistence(attributes),
          storage_provider: "vercel_blob",
          storage_locator: blob.pathname,
          filename: payload.filename,
          content_type: payload.contentType,
          size_bytes: Math.round(payload.size),
          tags: cleanTags(payload.tags),
          active: true,
          created_by: payload.userId,
          updated_by: payload.userId,
          updated_at: new Date().toISOString()
        }, { onConflict: "id" }).select("id").single();
        if (upsert.error) throw new Error(upsert.error.message);
      }
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Graphic upload could not be prepared.";
    return NextResponse.json({ error: message }, { status: message === "Forbidden" ? 403 : 400 });
  }
}

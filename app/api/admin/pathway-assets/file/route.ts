import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { PATHWAY_ASSET_STORAGE_PROVIDER } from "@/pathway-asset-ingest";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) return NextResponse.json({ error: "Vercel Blob is not connected." }, { status: 503 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Asset id is required." }, { status: 400 });
  const asset = await service.from("studio_pathway_assets")
    .select("id,storage_bucket,storage_path,metadata")
    .eq("id", id)
    .maybeSingle();
  if (asset.error) return NextResponse.json({ error: asset.error.message }, { status: 500 });
  if (!asset.data) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  if (asset.data.storage_bucket !== PATHWAY_ASSET_STORAGE_PROVIDER || !asset.data.storage_path) {
    return NextResponse.json({ error: "This asset is not stored in Vercel Blob." }, { status: 409 });
  }

  const result = await get(asset.data.storage_path, {
    access: "private",
    ifNoneMatch: request.headers.get("if-none-match") ?? undefined
  });
  if (!result) return new NextResponse("Not found", { status: 404 });
  if (result.statusCode === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache"
      }
    });
  }

  const fallbackMime = asset.data.metadata && typeof asset.data.metadata === "object" && typeof asset.data.metadata.mimeType === "string"
    ? asset.data.metadata.mimeType
    : "application/octet-stream";
  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      "Content-Type": result.blob.contentType || fallbackMime,
      "Content-Length": result.blob.size ? String(result.blob.size) : "",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      ETag: result.blob.etag,
      "Cache-Control": "private, no-cache"
    }
  });
}

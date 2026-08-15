import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function cleanFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]+/g, "").trim().replace(/\s+/g, "-").slice(0, 100) || "apostolic-guide-asset";
}

function extensionFor(contentType: string) {
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  return "bin";
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Asset id is required." }, { status: 400 });

  const asset = await service.from("studio_pathway_assets")
    .select("id,title,storage_bucket,storage_path,public_url,metadata")
    .eq("id", id)
    .maybeSingle();
  if (asset.error) return NextResponse.json({ error: asset.error.message }, { status: 500 });
  if (!asset.data) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  let bytes: ArrayBuffer;
  let contentType = typeof asset.data.metadata?.mime === "string" ? asset.data.metadata.mime : "application/octet-stream";

  if (asset.data.storage_bucket && asset.data.storage_path) {
    const result = await service.storage.from(asset.data.storage_bucket).download(asset.data.storage_path);
    if (result.error || !result.data) return NextResponse.json({ error: result.error?.message || "Asset file could not be downloaded." }, { status: 502 });
    contentType = result.data.type || contentType;
    bytes = await result.data.arrayBuffer();
  } else if (asset.data.public_url) {
    const response = await fetch(asset.data.public_url, { cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: `Asset source returned ${response.status}.` }, { status: 502 });
    contentType = response.headers.get("content-type") || contentType;
    bytes = await response.arrayBuffer();
  } else {
    return NextResponse.json({ error: "This asset has no downloadable file yet." }, { status: 409 });
  }

  const pathExtension = asset.data.storage_path?.split(".").pop()?.toLowerCase();
  const extension = pathExtension && /^[a-z0-9]{2,5}$/.test(pathExtension) ? pathExtension : extensionFor(contentType);
  const filename = `${cleanFilename(asset.data.title)}.${extension}`;
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

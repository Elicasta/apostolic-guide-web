import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

function clean(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "asset";
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const dataUrl = String(body.dataUrl || "");
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return NextResponse.json({ error: "A PNG, JPEG, or WebP data URL is required." }, { status: 400 });
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) return NextResponse.json({ error: "Image must be between 1 byte and 8 MB." }, { status: 400 });
  const mime = match[1];
  const extension = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const pathway = clean(String(body.pathwaySlug || "carousel"));
  const sourceRef = clean(String(body.sourceRef || "draft"));
  const index = Math.max(1, Number(body.index || 1));
  const path = `${pathway}/${sourceRef}/${String(index).padStart(2, "0")}.${extension}`;
  const upload = await service.storage.from("studio-social").upload(path, bytes, { contentType: mime, upsert: true, cacheControl: "3600" });
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 500 });
  return NextResponse.json({ path });
}

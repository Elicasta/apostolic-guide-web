import { createHash } from "node:crypto";
import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { loadCreativeProject } from "@/creative-project-server";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  frameId: z.string().trim().min(1).max(100),
  sortOrder: z.number().int().min(0).max(100),
  title: z.string().trim().min(1).max(180),
  dataUrl: z.string().min(30),
  altText: z.string().trim().max(1000).optional().default("")
});

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "creative";
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) return NextResponse.json({ error: "Vercel Blob is not connected." }, { status: 503 });
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid rendered asset." }, { status: 400 });

  const match = parsed.data.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return NextResponse.json({ error: "Rendered asset must be PNG, JPEG, or WebP." }, { status: 400 });
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) return NextResponse.json({ error: "Rendered asset must be 12 MB or smaller." }, { status: 400 });
  const mime = match[1];
  const extension = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const project = await loadCreativeProject(service, projectId);
  if (!project) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });
  const pathname = `creative-projects/${project.pathwaySlug}/${project.id}/renders/v${project.stateVersion}/${String(parsed.data.sortOrder + 1).padStart(2, "0")}-${safeName(parsed.data.title)}.${extension}`;
  let blob: Awaited<ReturnType<typeof put>> | null = null;
  try {
    blob = await put(pathname, bytes, { access: "public", contentType: mime, addRandomSuffix: true });
    const assetType = project.format === "single" ? "single-post" : project.format === "story" ? "story-frame" : "carousel-slide";
    const asset = await service.from("studio_pathway_assets").insert({
      pathway_slug: project.pathwaySlug,
      studio: "carousel",
      asset_type: assetType,
      title: parsed.data.title,
      status: project.status === "ready" || project.status === "scheduled" || project.status === "published" ? "ready" : "draft",
      source_type: "rendered",
      editable: false,
      content: { creativeProjectId: project.id, frameId: parsed.data.frameId, sortOrder: parsed.data.sortOrder },
      storage_bucket: "vercel_blob",
      storage_path: blob.pathname,
      public_url: blob.url,
      metadata: { mimeType: mime, bytes: bytes.length, sha256, altText: parsed.data.altText, creativeProjectId: project.id, projectStateVersion: project.stateVersion },
      created_by: access.user.id,
      updated_by: access.user.id
    }).select("*").single();
    if (asset.error) throw new Error(asset.error.message);
    const linked = await service.from("studio_creative_project_assets").insert({
      project_id: project.id,
      asset_id: asset.data.id,
      frame_id: parsed.data.frameId,
      role: parsed.data.sortOrder === 0 ? "cover" : "render",
      sort_order: parsed.data.sortOrder
    });
    if (linked.error) {
      await service.from("studio_pathway_assets").delete().eq("id", asset.data.id);
      throw new Error(linked.error.message);
    }
    return NextResponse.json({ asset: { ...asset.data, preview_url: blob.url }, link: { projectId: project.id, frameId: parsed.data.frameId, sortOrder: parsed.data.sortOrder } }, { status: 201 });
  } catch (error) {
    if (blob) await del(blob.url).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Rendered asset could not be saved." }, { status: 500 });
  }
}

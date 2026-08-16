import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  pathwaySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  studio: z.enum(["carousel","video"]),
  assetType: z.enum(["carousel-slide","single-post","story-frame","thumbnail","generated-image","uploaded-image","video-thumbnail","other"]),
  parentAssetId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(180),
  dataUrl: z.string().min(20),
  sourceType: z.enum(["generated","uploaded","rendered","manual"]).optional().default("uploaded"),
  content: z.record(z.string(), z.unknown()).optional().default({}),
  prompt: z.string().max(8000).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({})
});

function clean(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "asset";
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.pathwaySlug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  const match = parsed.data.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return NextResponse.json({ error: "Upload a PNG, JPEG, or WebP image." }, { status: 400 });
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) return NextResponse.json({ error: "Image must be 8 MB or smaller." }, { status: 400 });
  const mime = match[1];
  const extension = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  if (parsed.data.parentAssetId) {
    const parent = await service.from("studio_pathway_assets").select("id,pathway_slug,studio").eq("id", parsed.data.parentAssetId).maybeSingle();
    if (parent.error) return NextResponse.json({ error: parent.error.message }, { status: 500 });
    if (!parent.data || parent.data.pathway_slug !== pathway.slug || parent.data.studio !== parsed.data.studio) return NextResponse.json({ error: "Parent asset does not belong to this Pathway." }, { status: 409 });
  }

  const duplicate = await service.from("studio_pathway_assets")
    .select("id,title,studio,asset_type")
    .eq("pathway_slug", pathway.slug)
    .eq("studio", parsed.data.studio)
    .neq("status", "archived")
    .contains("metadata", { sha256 })
    .limit(1)
    .maybeSingle();
  if (duplicate.error) return NextResponse.json({ error: duplicate.error.message }, { status: 500 });
  if (duplicate.data) {
    return NextResponse.json({
      error: `This exact file is already saved as “${duplicate.data.title}” in this Pathway.`,
      duplicateAssetId: duplicate.data.id
    }, { status: 409 });
  }

  const assetId = crypto.randomUUID();
  const filename = `${Date.now()}-${clean(parsed.data.title)}.${extension}`;
  const storagePath = `pathways/${pathway.slug}/${parsed.data.studio}/${parsed.data.assetType}/${assetId}/${filename}`;
  const upload = await service.storage.from("studio-social").upload(storagePath, bytes, { contentType: mime, upsert: false, cacheControl: "3600" });
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 500 });

  const now = new Date().toISOString();
  const created = await service.from("studio_pathway_assets").insert({
    id: assetId,
    pathway_slug: pathway.slug,
    studio: parsed.data.studio,
    asset_type: parsed.data.assetType,
    parent_asset_id: parsed.data.parentAssetId ?? null,
    title: parsed.data.title,
    status: "draft",
    source_type: parsed.data.sourceType,
    editable: true,
    content: parsed.data.content,
    storage_bucket: "studio-social",
    storage_path: storagePath,
    prompt: parsed.data.prompt ?? null,
    model: parsed.data.model ?? null,
    metadata: { ...parsed.data.metadata, mime, bytes: bytes.length, sha256 },
    created_by: access.user.id,
    updated_by: access.user.id,
    created_at: now,
    updated_at: now
  }).select("*").single();
  if (created.error) {
    await service.storage.from("studio-social").remove([storagePath]);
    return NextResponse.json({ error: created.error.message }, { status: 500 });
  }

  const audit = await service.rpc("record_studio_audit", {
    p_actor_user_id: access.user.id,
    p_action: parsed.data.sourceType === "generated" ? "pathway_asset.generated_save" : "pathway_asset.upload",
    p_resource_type: "pathway_asset",
    p_resource_id: assetId,
    p_metadata: {
      pathwaySlug: pathway.slug,
      studio: parsed.data.studio,
      assetType: parsed.data.assetType,
      sourceType: parsed.data.sourceType,
      bytes: bytes.length,
      sha256
    }
  });
  if (audit.error) console.error("pathway asset upload audit failed", audit.error.message);

  const signed = await service.storage.from("studio-social").createSignedUrl(storagePath, 60 * 60);
  return NextResponse.json({ asset: { ...created.data, preview_url: signed.error ? null : signed.data.signedUrl } });
}

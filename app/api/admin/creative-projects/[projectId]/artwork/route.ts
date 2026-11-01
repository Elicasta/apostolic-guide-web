import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { loadCreativeProject } from "@/creative-project-server";
import { createServiceClient } from "@/supabase";

const saveSchema = z.object({
  assetId: z.string().uuid(),
  frameId: z.string().min(1).max(100),
  artDirection: z.string().trim().max(4000).optional().default("")
});

const removeSchema = z.object({ frameId: z.string().min(1).max(100) });

async function signedAssetUrl(service: NonNullable<ReturnType<typeof createServiceClient>>, asset: Record<string, unknown>) {
  const bucket = typeof asset.storage_bucket === "string" ? asset.storage_bucket : "";
  const path = typeof asset.storage_path === "string" ? asset.storage_path : "";
  if (bucket && path && bucket !== "vercel_blob") {
    const signed = await service.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (!signed.error) return signed.data.signedUrl;
  }
  return typeof asset.public_url === "string" ? asset.public_url : null;
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const project = await loadCreativeProject(service, projectId);
  if (!project) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });

  const links = await service.from("studio_creative_project_assets")
    .select("frame_id,sort_order,created_at,asset:studio_pathway_assets(id,title,public_url,storage_bucket,storage_path,prompt,model,metadata)")
    .eq("project_id", projectId)
    .eq("role", "background")
    .order("created_at", { ascending: false });
  if (links.error) return NextResponse.json({ error: links.error.message }, { status: 500 });

  const backgrounds = [] as Array<Record<string, unknown>>;
  for (const link of links.data ?? []) {
    const raw = Array.isArray(link.asset) ? link.asset[0] : link.asset;
    if (!raw || typeof raw !== "object") continue;
    const asset = raw as Record<string, unknown>;
    const frameId = String(link.frame_id || "");
    const frame = project.editorState.frames.find((item) => item.id === frameId);
    if (!frame) continue;
    const previewUrl = await signedAssetUrl(service, asset);
    backgrounds.push({
      frameId,
      order: frame.order,
      assetId: asset.id,
      title: asset.title,
      previewUrl,
      prompt: asset.prompt ?? null,
      model: asset.model ?? null,
      metadata: asset.metadata ?? {}
    });
  }

  return NextResponse.json({
    project: {
      id: project.id,
      title: project.title,
      pathwaySlug: project.pathwaySlug,
      format: project.format,
      frames: project.editorState.frames.map((frame) => ({ id: frame.id, order: frame.order }))
    },
    backgrounds
  });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid artwork link." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const project = await loadCreativeProject(service, projectId);
  if (!project) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });
  const frame = project.editorState.frames.find((item) => item.id === parsed.data.frameId);
  if (!frame) return NextResponse.json({ error: "Frame not found in this project." }, { status: 404 });

  const assetResult = await service.from("studio_pathway_assets")
    .select("id,pathway_slug,studio,title,public_url,storage_bucket,storage_path,prompt,model,metadata")
    .eq("id", parsed.data.assetId)
    .maybeSingle();
  if (assetResult.error) return NextResponse.json({ error: assetResult.error.message }, { status: 500 });
  if (!assetResult.data || assetResult.data.pathway_slug !== project.pathwaySlug || assetResult.data.studio !== "carousel") {
    return NextResponse.json({ error: "Artwork does not belong to this Carousel Pathway." }, { status: 409 });
  }

  const removed = await service.from("studio_creative_project_assets")
    .delete()
    .eq("project_id", projectId)
    .eq("frame_id", parsed.data.frameId)
    .eq("role", "background");
  if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });

  const linked = await service.from("studio_creative_project_assets").insert({
    project_id: projectId,
    asset_id: parsed.data.assetId,
    frame_id: parsed.data.frameId,
    role: "background",
    sort_order: Math.max(0, frame.order - 1)
  });
  if (linked.error) return NextResponse.json({ error: linked.error.message }, { status: 500 });

  const metadata = assetResult.data.metadata && typeof assetResult.data.metadata === "object"
    ? assetResult.data.metadata as Record<string, unknown>
    : {};
  await service.from("studio_pathway_assets").update({
    metadata: { ...metadata, creativeProjectId: projectId, frameId: parsed.data.frameId, artDirection: parsed.data.artDirection },
    updated_by: access.user.id,
    updated_at: new Date().toISOString()
  }).eq("id", parsed.data.assetId);

  const previewUrl = await signedAssetUrl(service, assetResult.data as Record<string, unknown>);
  return NextResponse.json({
    background: {
      frameId: parsed.data.frameId,
      order: frame.order,
      assetId: parsed.data.assetId,
      previewUrl,
      prompt: assetResult.data.prompt,
      model: assetResult.data.model,
      metadata: { ...metadata, artDirection: parsed.data.artDirection }
    }
  }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid frame." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const removed = await service.from("studio_creative_project_assets")
    .delete()
    .eq("project_id", projectId)
    .eq("frame_id", parsed.data.frameId)
    .eq("role", "background");
  if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

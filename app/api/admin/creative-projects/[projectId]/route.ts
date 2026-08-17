import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { CREATIVE_FORMATS, CREATIVE_INTENTS } from "@/creative-project";
import { creativeProjectFromRow, creativeProjectUpdatePayload, loadCreativeProject } from "@/creative-project-server";
import { privateBlobReadUrl } from "@/private-blob";
import { createServiceClient } from "@/supabase";

const autosaveSchema = z.object({
  expectedStateVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(180),
  pathwaySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  intent: z.enum(CREATIVE_INTENTS),
  format: z.enum(CREATIVE_FORMATS),
  destination: z.string().trim().min(1).max(80).default("instagram"),
  editorState: z.record(z.string(), z.unknown()),
  unifiedCaption: z.string().max(10000).default(""),
  cta: z.string().max(2000).default(""),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([])
});

async function withPrivatePreviewUrls(links: unknown[]) {
  return Promise.all(links.map(async (linkValue) => {
    const link = linkValue && typeof linkValue === "object" ? linkValue as Record<string, unknown> : {};
    const rawAsset = link.asset;
    const asset = Array.isArray(rawAsset) ? rawAsset[0] : rawAsset;
    if (!asset || typeof asset !== "object") return link;
    const row = asset as Record<string, unknown>;
    const storageBucket = String(row.storage_bucket || "");
    const storagePath = String(row.storage_path || "");
    const isPrivateBlob = storageBucket === "vercel_blob" && storagePath && (row.metadata as Record<string, unknown> | null)?.blobAccess === "private";
    if (!isPrivateBlob) return { ...link, asset: { ...row, preview_url: row.public_url || null } };
    try {
      const previewUrl = await privateBlobReadUrl(storagePath);
      return { ...link, asset: { ...row, public_url: previewUrl, preview_url: previewUrl } };
    } catch {
      return { ...link, asset: { ...row, public_url: null, preview_url: null } };
    }
  }));
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
  const [revisions, links, publications] = await Promise.all([
    service.from("studio_creative_project_revisions")
      .select("id,project_id,version,reason,change_summary,snapshot,restored_from_revision_id,created_at")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(100),
    service.from("studio_creative_project_assets")
      .select("frame_id,role,sort_order,created_at,asset:studio_pathway_assets(id,pathway_slug,studio,asset_type,title,status,source_type,public_url,storage_bucket,storage_path,metadata,created_at,updated_at)")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    service.from("pathway_publications")
      .select("id,pathway_slug,platform,status,external_post_id,published_url,scheduled_for,published_at,error_message,metadata,creative_project_id,publication_mode,manual_finish_reason,attempt_count,created_at,updated_at")
      .eq("creative_project_id", projectId)
      .order("created_at", { ascending: false })
  ]);
  const error = revisions.error || links.error || publications.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const assets = await withPrivatePreviewUrls((links.data ?? []) as unknown[]);
  return NextResponse.json({ project, revisions: revisions.data ?? [], assets, publications: publications.data ?? [] });
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  const parsed = autosaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid autosave payload." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    const payload = creativeProjectUpdatePayload(parsed.data);
    const now = new Date().toISOString();
    const saved = await service.from("studio_creative_projects").update({
      ...payload,
      state_version: parsed.data.expectedStateVersion + 1,
      last_autosaved_at: now,
      updated_by: access.user.id,
      updated_at: now
    }).eq("id", projectId).eq("state_version", parsed.data.expectedStateVersion).select("*").maybeSingle();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    if (!saved.data) {
      const latest = await loadCreativeProject(service, projectId);
      return NextResponse.json({ error: "This project changed in another editor. Reload before overwriting it.", project: latest }, { status: 409 });
    }
    return NextResponse.json({ project: creativeProjectFromRow(saved.data as Record<string, unknown>) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Creative Project could not be saved." }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

const assetTypes = [
  "carousel-deck","carousel-slide","single-post","story-set","story-frame","thumbnail",
  "generated-image","uploaded-image","caption","video-project","video-render","video-thumbnail","other"
] as const;
const studios = ["carousel","video"] as const;
const statuses = ["draft","review","approved","ready","published","archived"] as const;
const sourceTypes = ["manual","sol","generated","uploaded","rendered","imported"] as const;

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  pathwaySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  studio: z.enum(studios),
  assetType: z.enum(assetTypes),
  parentAssetId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(180),
  status: z.enum(statuses).optional().default("draft"),
  sourceType: z.enum(sourceTypes).optional().default("manual"),
  editable: z.boolean().optional().default(true),
  content: z.record(z.string(), z.unknown()).optional().default({}),
  storageBucket: z.string().max(80).nullable().optional(),
  storagePath: z.string().max(500).nullable().optional(),
  publicUrl: z.string().url().nullable().optional(),
  prompt: z.string().max(8000).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({})
});

async function signedPreview(service: NonNullable<ReturnType<typeof createServiceClient>>, row: Record<string, unknown>) {
  const bucket = typeof row.storage_bucket === "string" ? row.storage_bucket : null;
  const path = typeof row.storage_path === "string" ? row.storage_path : null;
  if (!bucket || !path) return { ...row, preview_url: row.public_url ?? null };
  if (typeof row.public_url === "string" && row.public_url) return { ...row, preview_url: row.public_url };
  const signed = await service.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return { ...row, preview_url: signed.error ? null : signed.data.signedUrl };
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const pathwaySlug = url.searchParams.get("pathwaySlug")?.trim() || "";
  const studio = url.searchParams.get("studio")?.trim() || "";
  if (!pathwaySlug || !pathwayBySlug(pathwaySlug)) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
  if (!studios.includes(studio as typeof studios[number])) return NextResponse.json({ error: "Invalid studio." }, { status: 400 });

  const result = await service.from("studio_pathway_assets")
    .select("id,pathway_slug,studio,asset_type,parent_asset_id,title,status,source_type,editable,version,content,storage_bucket,storage_path,public_url,prompt,model,metadata,created_at,updated_at")
    .eq("pathway_slug", pathwaySlug)
    .eq("studio", studio)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(250);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  const assets = await Promise.all((result.data ?? []).map((row) => signedPreview(service, row as Record<string, unknown>)));
  return NextResponse.json({ assets });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid asset." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.pathwaySlug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const now = new Date().toISOString();
  const data = parsed.data;
  if (data.parentAssetId) {
    const parent = await service.from("studio_pathway_assets").select("id,pathway_slug,studio").eq("id", data.parentAssetId).maybeSingle();
    if (parent.error) return NextResponse.json({ error: parent.error.message }, { status: 500 });
    if (!parent.data || parent.data.pathway_slug !== pathway.slug || parent.data.studio !== data.studio) return NextResponse.json({ error: "Parent asset must belong to the same Pathway and Studio." }, { status: 409 });
  }

  if (data.id) {
    const current = await service.from("studio_pathway_assets")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
    if (!current.data) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    if (current.data.pathway_slug !== pathway.slug || current.data.studio !== data.studio) return NextResponse.json({ error: "Asset does not belong to this Pathway and Studio." }, { status: 409 });

    const nextVersion = Number(current.data.version || 1) + 1;
    const versionSaved = await service.from("studio_pathway_asset_versions").insert({
      asset_id: data.id,
      version: Number(current.data.version || 1),
      snapshot: current.data,
      created_by: access.user.id
    });
    if (versionSaved.error && versionSaved.error.code !== "23505") return NextResponse.json({ error: versionSaved.error.message }, { status: 500 });

    const updated = await service.from("studio_pathway_assets").update({
      parent_asset_id: data.parentAssetId ?? null,
      asset_type: data.assetType,
      title: data.title,
      status: data.status,
      source_type: data.sourceType,
      editable: data.editable,
      version: nextVersion,
      content: data.content,
      storage_bucket: data.storageBucket ?? null,
      storage_path: data.storagePath ?? null,
      public_url: data.publicUrl ?? null,
      prompt: data.prompt ?? null,
      model: data.model ?? null,
      metadata: data.metadata,
      updated_by: access.user.id,
      updated_at: now
    }).eq("id", data.id).select("*").single();
    if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
    return NextResponse.json({ asset: await signedPreview(service, updated.data as Record<string, unknown>) });
  }

  const created = await service.from("studio_pathway_assets").insert({
    pathway_slug: pathway.slug,
    studio: data.studio,
    asset_type: data.assetType,
    parent_asset_id: data.parentAssetId ?? null,
    title: data.title,
    status: data.status,
    source_type: data.sourceType,
    editable: data.editable,
    content: data.content,
    storage_bucket: data.storageBucket ?? null,
    storage_path: data.storagePath ?? null,
    public_url: data.publicUrl ?? null,
    prompt: data.prompt ?? null,
    model: data.model ?? null,
    metadata: data.metadata,
    created_by: access.user.id,
    updated_by: access.user.id,
    created_at: now,
    updated_at: now
  }).select("*").single();
  if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
  return NextResponse.json({ asset: await signedPreview(service, created.data as Record<string, unknown>) });
}

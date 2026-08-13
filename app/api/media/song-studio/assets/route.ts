import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSongStudioAccess } from "@/song-studio/server";

export const runtime = "nodejs";

const BUCKET = "song-assets";
const assetTypes = ["suno_audio", "mix", "master", "cover", "video", "stems", "other"] as const;
const allowedMimeTypes = new Set([
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4",
  "video/mp4", "image/jpeg", "image/png", "image/webp", "application/zip"
]);

const signSchema = z.object({
  action: z.literal("sign"),
  project_id: z.string().uuid(),
  asset_type: z.enum(assetTypes),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(120),
  file_size_bytes: z.number().int().min(1).max(1073741824)
});

const registerSchema = z.object({
  action: z.literal("register"),
  project_id: z.string().uuid(),
  asset_type: z.enum(assetTypes),
  storage_path: z.string().trim().min(1).max(1000),
  mime_type: z.string().trim().max(120).nullable().optional(),
  file_size_bytes: z.number().int().min(0).max(1073741824).nullable().optional(),
  is_final: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const externalSchema = z.object({
  action: z.literal("external"),
  project_id: z.string().uuid(),
  asset_type: z.enum(assetTypes),
  external_url: z.string().url().max(2000),
  is_final: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({})
});

function safeFileName(name: string) {
  const clean = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return clean.slice(-180) || "asset";
}

export async function GET(request: Request) {
  const auth = await requireSongStudioAccess();
  if (!auth.ok || !auth.service) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId || !z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Valid projectId required." }, { status: 400 });

  const assetsResult = await auth.service.from("song_assets").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (assetsResult.error) return NextResponse.json({ error: assetsResult.error.message }, { status: 500 });
  const assets = await Promise.all((assetsResult.data ?? []).map(async (asset) => {
    if (!asset.storage_path) return { ...asset, signed_url: asset.external_url ?? null };
    const signed = await auth.service!.storage.from(asset.storage_bucket || BUCKET).createSignedUrl(asset.storage_path, 3600);
    return { ...asset, signed_url: signed.error ? null : signed.data.signedUrl };
  }));
  return NextResponse.json({ assets });
}

export async function POST(request: Request) {
  const auth = await requireSongStudioAccess();
  if (!auth.ok || !auth.service || !auth.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (action === "sign") {
    const parsed = signSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid upload request.", issues: parsed.error.flatten() }, { status: 400 });
    if (!allowedMimeTypes.has(parsed.data.mime_type)) return NextResponse.json({ error: `Unsupported file type: ${parsed.data.mime_type}` }, { status: 415 });

    const project = await auth.service.from("song_projects").select("id").eq("id", parsed.data.project_id).maybeSingle();
    if (project.error) return NextResponse.json({ error: project.error.message }, { status: 500 });
    if (!project.data) return NextResponse.json({ error: "Song project not found." }, { status: 404 });

    const storagePath = `${parsed.data.project_id}/${parsed.data.asset_type}/${crypto.randomUUID()}-${safeFileName(parsed.data.file_name)}`;
    const signed = await auth.service.storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
    if (signed.error) return NextResponse.json({ error: signed.error.message }, { status: 500 });
    return NextResponse.json({ bucket: BUCKET, path: storagePath, token: signed.data.token, signed_url: signed.data.signedUrl });
  }

  if (action === "register") {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid asset registration.", issues: parsed.error.flatten() }, { status: 400 });
    if (!parsed.data.storage_path.startsWith(`${parsed.data.project_id}/`)) return NextResponse.json({ error: "Asset path does not belong to this project." }, { status: 400 });

    const inserted = await auth.service.from("song_assets").insert({
      project_id: parsed.data.project_id,
      asset_type: parsed.data.asset_type,
      storage_bucket: BUCKET,
      storage_path: parsed.data.storage_path,
      mime_type: parsed.data.mime_type ?? null,
      file_size_bytes: parsed.data.file_size_bytes ?? null,
      is_final: parsed.data.is_final,
      metadata: parsed.data.metadata,
      created_by: auth.user.id
    }).select("*").single();
    if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    return NextResponse.json({ asset: inserted.data }, { status: 201 });
  }

  if (action === "external") {
    const parsed = externalSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid external asset.", issues: parsed.error.flatten() }, { status: 400 });
    const inserted = await auth.service.from("song_assets").insert({
      project_id: parsed.data.project_id,
      asset_type: parsed.data.asset_type,
      external_url: parsed.data.external_url,
      is_final: parsed.data.is_final,
      metadata: parsed.data.metadata,
      created_by: auth.user.id
    }).select("*").single();
    if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    return NextResponse.json({ asset: inserted.data }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown asset action." }, { status: 400 });
}

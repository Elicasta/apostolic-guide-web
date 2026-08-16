import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

const schema = z.object({
  assetId: z.string().uuid(),
  version: z.number().int().positive()
});

const RESTORABLE_FIELDS = [
  "parent_asset_id",
  "asset_type",
  "title",
  "status",
  "source_type",
  "editable",
  "content",
  "storage_bucket",
  "storage_path",
  "public_url",
  "prompt",
  "model",
  "metadata"
] as const;

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid version restore request." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const [currentResult, versionResult] = await Promise.all([
    service.from("studio_pathway_assets").select("*").eq("id", parsed.data.assetId).maybeSingle(),
    service.from("studio_pathway_asset_versions").select("snapshot,version").eq("asset_id", parsed.data.assetId).eq("version", parsed.data.version).maybeSingle()
  ]);

  if (currentResult.error) return NextResponse.json({ error: currentResult.error.message }, { status: 500 });
  if (versionResult.error) return NextResponse.json({ error: versionResult.error.message }, { status: 500 });
  if (!currentResult.data) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  if (!versionResult.data?.snapshot || typeof versionResult.data.snapshot !== "object" || Array.isArray(versionResult.data.snapshot)) {
    return NextResponse.json({ error: "Saved version not found." }, { status: 404 });
  }

  const currentVersion = Number(currentResult.data.version || 1);
  if (parsed.data.version === currentVersion) {
    return NextResponse.json({ error: "That version is already current." }, { status: 409 });
  }

  const preserved = await service.from("studio_pathway_asset_versions").insert({
    asset_id: parsed.data.assetId,
    version: currentVersion,
    snapshot: currentResult.data,
    created_by: access.user.id
  });
  if (preserved.error && preserved.error.code !== "23505") {
    return NextResponse.json({ error: preserved.error.message }, { status: 500 });
  }

  const snapshot = versionResult.data.snapshot as Record<string, unknown>;
  const restored: Record<string, unknown> = {};
  for (const field of RESTORABLE_FIELDS) {
    if (field in snapshot) restored[field] = snapshot[field];
  }

  restored.version = currentVersion + 1;
  restored.updated_by = access.user.id;
  restored.updated_at = new Date().toISOString();

  const saved = await service.from("studio_pathway_assets")
    .update(restored)
    .eq("id", parsed.data.assetId)
    .select("*")
    .single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  return NextResponse.json({
    asset: saved.data,
    restoredFromVersion: parsed.data.version,
    preservedVersion: currentVersion
  });
}

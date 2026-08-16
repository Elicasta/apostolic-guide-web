import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

const schema = z.object({ assetId: z.string().uuid(), enabled: z.boolean().optional().default(true) });

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid style reference." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const asset = await service.from("studio_pathway_assets").select("id,pathway_slug,storage_bucket,storage_path,public_url,asset_type").eq("id", parsed.data.assetId).maybeSingle();
  if (asset.error) return NextResponse.json({ error: asset.error.message }, { status: 500 });
  if (!asset.data || (!asset.data.storage_path && !asset.data.public_url)) return NextResponse.json({ error: "Style references must have an image file." }, { status: 409 });

  const profile = await service.from("studio_visual_style_profile").select("reference_asset_ids").eq("id", "apostolic-guide").maybeSingle();
  if (profile.error) return NextResponse.json({ error: profile.error.message }, { status: 500 });
  const current = Array.isArray(profile.data?.reference_asset_ids) ? profile.data.reference_asset_ids.filter((id): id is string => typeof id === "string") : [];
  const next = parsed.data.enabled
    ? Array.from(new Set([...current, parsed.data.assetId])).slice(-12)
    : current.filter((id) => id !== parsed.data.assetId);
  const saved = await service.from("studio_visual_style_profile").update({ reference_asset_ids: next, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", "apostolic-guide").select("reference_asset_ids").single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  const audit = await service.rpc("record_studio_audit", {
    p_actor_user_id: access.user.id,
    p_action: parsed.data.enabled ? "pathway_asset.style_reference_add" : "pathway_asset.style_reference_remove",
    p_resource_type: "pathway_asset",
    p_resource_id: parsed.data.assetId,
    p_metadata: { pathwaySlug: asset.data.pathway_slug, referenceCount: next.length }
  });
  if (audit.error) console.error("pathway asset style audit failed", audit.error.message);

  return NextResponse.json({ referenceAssetIds: saved.data.reference_asset_ids });
}

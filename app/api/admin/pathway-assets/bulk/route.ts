import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { normalizeAssetTags } from "@/pathway-asset-metadata";
import { createServiceClient } from "@/supabase";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(["draft", "review", "approved", "ready", "published"]).optional(),
  favorite: z.boolean().optional(),
  addTags: z.array(z.string().trim().min(1).max(40)).max(24).optional(),
  archive: z.boolean().optional()
}).refine((value) => value.status !== undefined || value.favorite !== undefined || value.addTags !== undefined || value.archive === true, {
  message: "No bulk changes supplied."
});

export async function PATCH(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid bulk asset update." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const uniqueIds = Array.from(new Set(parsed.data.ids));
  const current = await service.from("studio_pathway_assets")
    .select("id,pathway_slug,metadata,status")
    .in("id", uniqueIds)
    .neq("status", "archived");
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
  if ((current.data?.length ?? 0) !== uniqueIds.length) return NextResponse.json({ error: "One or more selected assets are unavailable." }, { status: 409 });

  const now = new Date().toISOString();
  const addTags = normalizeAssetTags(parsed.data.addTags ?? []);
  const updatedIds: string[] = [];

  for (const asset of current.data ?? []) {
    const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? { ...(asset.metadata as Record<string, unknown>) }
      : {};
    if (parsed.data.favorite !== undefined) metadata.favorite = parsed.data.favorite;
    if (addTags.length) metadata.tags = normalizeAssetTags([
      ...(Array.isArray(metadata.tags) ? metadata.tags : []),
      ...addTags
    ]);

    const values: Record<string, unknown> = {
      metadata,
      updated_by: access.user.id,
      updated_at: now
    };
    if (parsed.data.status !== undefined) values.status = parsed.data.status;
    if (parsed.data.archive === true) values.status = "archived";

    const saved = await service.from("studio_pathway_assets").update(values).eq("id", asset.id).select("id").single();
    if (saved.error) return NextResponse.json({ error: saved.error.message, updatedIds }, { status: 500 });
    updatedIds.push(asset.id);
  }

  await service.rpc("record_studio_audit", {
    p_actor_user_id: access.user.id,
    p_action: parsed.data.archive === true ? "pathway_asset.bulk_archive" : "pathway_asset.bulk_update",
    p_resource_type: "pathway_asset_batch",
    p_resource_id: null,
    p_metadata: {
      ids: updatedIds,
      count: updatedIds.length,
      status: parsed.data.status ?? null,
      favorite: parsed.data.favorite ?? null,
      addTags
    }
  }).catch(() => null);

  return NextResponse.json({ updatedIds, count: updatedIds.length });
}

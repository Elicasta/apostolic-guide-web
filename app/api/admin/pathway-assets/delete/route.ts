import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { assetMetadataString, collectPathwayAssetDeleteIds } from "@/pathway-asset-delete";
import { PATHWAY_ASSET_STORAGE_PROVIDER } from "@/pathway-asset-ingest";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ id: z.string().uuid() });

type AssetRow = {
  id: string;
  parent_asset_id: string | null;
  pathway_slug: string;
  studio: string;
  asset_type: string;
  title: string;
  status: string;
  storage_bucket: string | null;
  storage_path: string | null;
  public_url: string | null;
  metadata: unknown;
};

type LinkedRender = {
  id: string;
  project_id: string | null;
  asset_id: string | null;
  status: string;
  storage_path: string | null;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

async function removeStoredFiles(
  service: NonNullable<ReturnType<typeof createServiceClient>>,
  assets: Array<Pick<AssetRow, "storage_bucket" | "storage_path">>,
  linkedRenders: LinkedRender[]
) {
  const supabasePaths = new Map<string, Set<string>>();
  const blobPaths = new Set<string>();

  for (const asset of assets) {
    if (!asset.storage_bucket || !asset.storage_path) continue;
    if (asset.storage_bucket === PATHWAY_ASSET_STORAGE_PROVIDER) {
      blobPaths.add(asset.storage_path);
      continue;
    }
    const paths = supabasePaths.get(asset.storage_bucket) ?? new Set<string>();
    paths.add(asset.storage_path);
    supabasePaths.set(asset.storage_bucket, paths);
  }

  for (const render of linkedRenders) {
    if (!render.storage_path) continue;
    const paths = supabasePaths.get("pathway-video") ?? new Set<string>();
    paths.add(render.storage_path);
    supabasePaths.set("pathway-video", paths);
  }

  if (blobPaths.size) {
    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) throw new Error("Vercel Blob is not connected, so the stored file could not be removed.");
    await del(Array.from(blobPaths));
  }

  for (const [bucket, paths] of supabasePaths) {
    const result = await service.storage.from(bucket).remove(Array.from(paths));
    if (result.error) throw new Error(`Stored file cleanup failed in ${bucket}: ${result.error.message}`);
  }
}

export async function DELETE(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid asset id is required." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const rootResult = await service.from("studio_pathway_assets")
    .select("id,parent_asset_id,pathway_slug,studio,asset_type,title,status,storage_bucket,storage_path,public_url,metadata")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (rootResult.error) return NextResponse.json({ error: rootResult.error.message }, { status: 500 });
  if (!rootResult.data) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  const root = rootResult.data as AssetRow;

  const treeResult = await service.from("studio_pathway_assets")
    .select("id,parent_asset_id,pathway_slug,studio,asset_type,title,status,storage_bucket,storage_path,public_url,metadata")
    .eq("pathway_slug", root.pathway_slug)
    .eq("studio", root.studio)
    .limit(1000);
  if (treeResult.error) return NextResponse.json({ error: treeResult.error.message }, { status: 500 });

  const treeRows = (treeResult.data ?? []) as AssetRow[];
  const deleteIds = collectPathwayAssetDeleteIds(root.id, treeRows);
  const deleteIdSet = new Set(deleteIds);
  const deletingRows = treeRows.filter((asset) => deleteIdSet.has(asset.id));

  if (deletingRows.some((asset) => asset.status === "published")) {
    return NextResponse.json({ error: "Published assets cannot be permanently deleted. Archive them instead." }, { status: 409 });
  }

  const usageResult = await service.from("studio_content_calendar_items")
    .select("id,asset_id,status")
    .in("asset_id", deleteIds)
    .neq("status", "cancelled")
    .limit(1);
  if (usageResult.error) return NextResponse.json({ error: usageResult.error.message }, { status: 500 });
  if ((usageResult.data ?? []).length) {
    return NextResponse.json({ error: "This asset is still used by the Content Calendar. Remove that reference or archive the asset instead." }, { status: 409 });
  }

  const directRenderIds = uniqueStrings(deletingRows.map((asset) => assetMetadataString(asset.metadata, "renderId")));
  const videoProjectIds = uniqueStrings(deletingRows.map((asset) => assetMetadataString(asset.metadata, "videoProjectId")));

  const linkedRenders: LinkedRender[] = [];
  if (directRenderIds.length) {
    const result = await service.from("pathway_video_renders")
      .select("id,project_id,asset_id,status,storage_path")
      .in("id", directRenderIds);
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    linkedRenders.push(...((result.data ?? []) as LinkedRender[]));
  }
  if (videoProjectIds.length) {
    const result = await service.from("pathway_video_renders")
      .select("id,project_id,asset_id,status,storage_path")
      .in("project_id", videoProjectIds);
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    const known = new Set(linkedRenders.map((render) => render.id));
    for (const render of (result.data ?? []) as LinkedRender[]) {
      if (!known.has(render.id)) linkedRenders.push(render);
    }
  }

  const linkedAssetIds = uniqueStrings(linkedRenders.map((render) => render.asset_id));
  if (linkedAssetIds.length) {
    const [publicationResult, sourceAssetResult] = await Promise.all([
      service.from("pathway_publications").select("id,asset_id,status,published_url").in("asset_id", linkedAssetIds),
      service.from("pathway_assets").select("id,status,published_url").in("id", linkedAssetIds)
    ]);
    if (publicationResult.error) return NextResponse.json({ error: publicationResult.error.message }, { status: 500 });
    if (sourceAssetResult.error) return NextResponse.json({ error: sourceAssetResult.error.message }, { status: 500 });

    const protectedPublication = (publicationResult.data ?? []).some((publication) =>
      publication.status === "published" || publication.status === "scheduled" || Boolean(publication.published_url)
    );
    const protectedSourceAsset = (sourceAssetResult.data ?? []).some((asset) =>
      asset.status === "published" || asset.status === "scheduled" || Boolean(asset.published_url)
    );
    if (protectedPublication || protectedSourceAsset) {
      return NextResponse.json({ error: "This video is connected to published or scheduled content. Archive it instead of deleting it." }, { status: 409 });
    }
  }

  try {
    await removeStoredFiles(service, deletingRows, linkedRenders);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Stored files could not be removed." }, { status: 502 });
  }

  const styleProfile = await service.from("studio_visual_style_profile")
    .select("reference_asset_ids")
    .eq("id", "apostolic-guide")
    .maybeSingle();
  if (styleProfile.error) return NextResponse.json({ error: styleProfile.error.message }, { status: 500 });
  if (styleProfile.data?.reference_asset_ids && Array.isArray(styleProfile.data.reference_asset_ids)) {
    const nextReferences = styleProfile.data.reference_asset_ids.filter((id: unknown) => typeof id === "string" && !deleteIdSet.has(id));
    if (nextReferences.length !== styleProfile.data.reference_asset_ids.length) {
      const styleUpdate = await service.from("studio_visual_style_profile")
        .update({ reference_asset_ids: nextReferences, updated_by: access.user.id, updated_at: new Date().toISOString() })
        .eq("id", "apostolic-guide");
      if (styleUpdate.error) return NextResponse.json({ error: styleUpdate.error.message }, { status: 500 });
    }
  }

  if (directRenderIds.length && !videoProjectIds.length) {
    const renderDelete = await service.from("pathway_video_renders").delete().in("id", directRenderIds);
    if (renderDelete.error) return NextResponse.json({ error: renderDelete.error.message }, { status: 500 });
  }

  if (videoProjectIds.length) {
    const projectDelete = await service.from("pathway_video_projects").delete().in("id", videoProjectIds);
    if (projectDelete.error) return NextResponse.json({ error: projectDelete.error.message }, { status: 500 });
  }

  if (linkedAssetIds.length) {
    const publicationDelete = await service.from("pathway_publications").delete().in("asset_id", linkedAssetIds);
    if (publicationDelete.error) return NextResponse.json({ error: publicationDelete.error.message }, { status: 500 });

    const sourceDelete = await service.from("pathway_assets").delete().in("id", linkedAssetIds);
    if (sourceDelete.error) return NextResponse.json({ error: sourceDelete.error.message }, { status: 500 });
  }

  const clearsPublishingKit = deletingRows.some((asset) =>
    asset.asset_type === "video-thumbnail" && assetMetadataString(asset.metadata, "source") === "video-publishing-kit"
  );
  if (clearsPublishingKit) {
    const kitUpdate = await service.from("pathway_video_publishing_kits")
      .update({ thumbnail_background_url: null, thumbnail_storage_path: null, updated_by: access.user.id, updated_at: new Date().toISOString() })
      .eq("pathway_slug", root.pathway_slug);
    if (kitUpdate.error) return NextResponse.json({ error: kitUpdate.error.message }, { status: 500 });
  }

  const deleted = await service.from("studio_pathway_assets").delete().eq("id", root.id);
  if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 500 });

  const audit = await service.rpc("record_studio_audit", {
    p_actor_user_id: access.user.id,
    p_action: "pathway_asset.delete",
    p_resource_type: "pathway_asset",
    p_resource_id: root.id,
    p_metadata: {
      pathwaySlug: root.pathway_slug,
      studio: root.studio,
      title: root.title,
      deletedIds: deleteIds,
      removedStoredFiles: true,
      linkedRenderIds: linkedRenders.map((render) => render.id)
    }
  });
  if (audit.error) console.error("pathway asset delete audit failed", audit.error.message);

  return NextResponse.json({ ok: true, id: root.id, deletedIds: deleteIds });
}

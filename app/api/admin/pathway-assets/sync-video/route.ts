import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

const schema = z.object({ pathwaySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Pathway." }, { status: 400 });
  const pathway = pathwayBySlug(parsed.data.pathwaySlug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const [projectResult, rendersResult, kitResult] = await Promise.all([
    service.from("pathway_video_projects").select("id,pathway_slug,audio_content_hash,timeline,style,updated_at").eq("pathway_slug", pathway.slug).maybeSingle(),
    service.from("pathway_video_renders").select("id,pathway_slug,asset_id,format,status,output_url,storage_path,error,requested_at,completed_at").eq("pathway_slug", pathway.slug).eq("status", "completed").order("requested_at", { ascending: false }).limit(100),
    service.from("pathway_video_publishing_kits").select("thumbnail_background_url,thumbnail_storage_path,metadata,image_model,image_quality,updated_at").eq("pathway_slug", pathway.slug).maybeSingle()
  ]);
  const failed = [projectResult.error, rendersResult.error, kitResult.error].find(Boolean);
  if (failed) return NextResponse.json({ error: failed!.message }, { status: 500 });

  const sourceAssetIds = Array.from(new Set((rendersResult.data ?? [])
    .map((render) => render.asset_id)
    .filter((id): id is string => typeof id === "string" && Boolean(id))));
  const sourceAssetsResult = sourceAssetIds.length
    ? await service.from("pathway_assets").select("id,status").in("id", sourceAssetIds)
    : { data: [], error: null };
  if (sourceAssetsResult.error) return NextResponse.json({ error: sourceAssetsResult.error.message }, { status: 500 });

  const archivedSourceAssetIds = new Set((sourceAssetsResult.data ?? [])
    .filter((asset) => asset.status === "archived")
    .map((asset) => asset.id));
  const archivedRenderIds = (rendersResult.data ?? [])
    .filter((render) => typeof render.asset_id === "string" && archivedSourceAssetIds.has(render.asset_id))
    .map((render) => render.id);
  const eligibleRenders = (rendersResult.data ?? [])
    .filter((render) => !(typeof render.asset_id === "string" && archivedSourceAssetIds.has(render.asset_id)));

  const staleRenderAssets = await service.from("studio_pathway_assets")
    .delete()
    .eq("pathway_slug", pathway.slug)
    .eq("studio", "video")
    .eq("asset_type", "video-render")
    .is("storage_path", null)
    .is("public_url", null);
  if (staleRenderAssets.error) return NextResponse.json({ error: staleRenderAssets.error.message }, { status: 500 });

  for (const renderId of archivedRenderIds) {
    const archivedSync = await service.from("studio_pathway_assets")
      .delete()
      .eq("pathway_slug", pathway.slug)
      .eq("studio", "video")
      .eq("asset_type", "video-render")
      .contains("metadata", { renderId });
    if (archivedSync.error) return NextResponse.json({ error: archivedSync.error.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  let parentId: string | null = null;
  if (projectResult.data) {
    const existing = await service.from("studio_pathway_assets").select("id,version").eq("pathway_slug", pathway.slug).eq("studio", "video").eq("asset_type", "video-project").contains("metadata", { videoProjectId: projectResult.data.id }).maybeSingle();
    if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
    if (existing.data) {
      parentId = existing.data.id;
      const updated = await service.from("studio_pathway_assets").update({ title: `${pathway.title} · Video Studio`, content: { timeline: projectResult.data.timeline, style: projectResult.data.style, audioContentHash: projectResult.data.audio_content_hash }, source_type: "imported", editable: true, metadata: { videoProjectId: projectResult.data.id }, updated_by: access.user.id, updated_at: now }).eq("id", parentId);
      if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
    } else {
      const inserted = await service.from("studio_pathway_assets").insert({ pathway_slug: pathway.slug, studio: "video", asset_type: "video-project", title: `${pathway.title} · Video Studio`, status: "draft", source_type: "imported", editable: true, content: { timeline: projectResult.data.timeline, style: projectResult.data.style, audioContentHash: projectResult.data.audio_content_hash }, metadata: { videoProjectId: projectResult.data.id }, created_by: access.user.id, updated_by: access.user.id, created_at: now, updated_at: now }).select("id").single();
      if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
      parentId = inserted.data.id;
    }
  }

  for (const render of eligibleRenders) {
    const existing = await service.from("studio_pathway_assets").select("id").eq("pathway_slug", pathway.slug).eq("studio", "video").eq("asset_type", "video-render").contains("metadata", { renderId: render.id }).maybeSingle();
    if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
    const values = {
      pathway_slug: pathway.slug,
      studio: "video",
      asset_type: "video-render",
      parent_asset_id: parentId,
      title: `${pathway.title} · ${String(render.format).toUpperCase()} render`,
      status: "ready",
      source_type: "rendered",
      editable: false,
      content: { format: render.format, renderStatus: render.status, error: render.error },
      storage_bucket: render.storage_path ? "pathway-video" : null,
      storage_path: render.storage_path,
      public_url: render.output_url,
      metadata: { renderId: render.id, requestedAt: render.requested_at, completedAt: render.completed_at },
      updated_by: access.user.id,
      updated_at: now
    };
    if (existing.data) {
      const updated = await service.from("studio_pathway_assets").update(values).eq("id", existing.data.id);
      if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
    } else {
      const inserted = await service.from("studio_pathway_assets").insert({ ...values, created_by: access.user.id, created_at: now });
      if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }
  }

  if (kitResult.data?.thumbnail_background_url) {
    const existing = await service.from("studio_pathway_assets").select("id").eq("pathway_slug", pathway.slug).eq("studio", "video").eq("asset_type", "video-thumbnail").contains("metadata", { source: "video-publishing-kit" }).maybeSingle();
    if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
    const values = {
      pathway_slug: pathway.slug,
      studio: "video",
      asset_type: "video-thumbnail",
      parent_asset_id: parentId,
      title: `${pathway.title} · YouTube thumbnail background`,
      status: "ready",
      source_type: "generated",
      editable: true,
      content: { metadata: kitResult.data.metadata },
      storage_bucket: kitResult.data.thumbnail_storage_path ? "pathway-thumbnail" : null,
      storage_path: kitResult.data.thumbnail_storage_path,
      public_url: kitResult.data.thumbnail_background_url,
      model: kitResult.data.image_model,
      metadata: { source: "video-publishing-kit", imageQuality: kitResult.data.image_quality },
      updated_by: access.user.id,
      updated_at: now
    };
    if (existing.data) {
      const updated = await service.from("studio_pathway_assets").update(values).eq("id", existing.data.id);
      if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
    } else {
      const inserted = await service.from("studio_pathway_assets").insert({ ...values, created_by: access.user.id, created_at: now });
      if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, syncedRenders: eligibleRenders.length, skippedArchivedRenders: archivedRenderIds.length });
}

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
    service.from("pathway_video_renders").select("id,pathway_slug,format,status,output_url,storage_path,error,requested_at,completed_at").eq("pathway_slug", pathway.slug).order("requested_at", { ascending: false }).limit(30),
    service.from("pathway_video_publishing_kits").select("thumbnail_background_url,thumbnail_storage_path,metadata,image_model,image_quality,updated_at").eq("pathway_slug", pathway.slug).maybeSingle()
  ]);
  const failed = [projectResult.error, rendersResult.error, kitResult.error].find(Boolean);
  if (failed) return NextResponse.json({ error: failed!.message }, { status: 500 });

  const now = new Date().toISOString();
  let parentId: string | null = null;
  if (projectResult.data) {
    const existing = await service.from("studio_pathway_assets").select("id,version").eq("pathway_slug", pathway.slug).eq("studio", "video").eq("asset_type", "video-project").contains("metadata", { videoProjectId: projectResult.data.id }).maybeSingle();
    if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
    if (existing.data) {
      parentId = existing.data.id;
      await service.from("studio_pathway_assets").update({ title: `${pathway.title} · Video Studio`, content: { timeline: projectResult.data.timeline, style: projectResult.data.style, audioContentHash: projectResult.data.audio_content_hash }, source_type: "imported", editable: true, metadata: { videoProjectId: projectResult.data.id }, updated_by: access.user.id, updated_at: now }).eq("id", parentId);
    } else {
      const inserted = await service.from("studio_pathway_assets").insert({ pathway_slug: pathway.slug, studio: "video", asset_type: "video-project", title: `${pathway.title} · Video Studio`, status: "draft", source_type: "imported", editable: true, content: { timeline: projectResult.data.timeline, style: projectResult.data.style, audioContentHash: projectResult.data.audio_content_hash }, metadata: { videoProjectId: projectResult.data.id }, created_by: access.user.id, updated_by: access.user.id, created_at: now, updated_at: now }).select("id").single();
      if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
      parentId = inserted.data.id;
    }
  }

  for (const render of rendersResult.data ?? []) {
    const existing = await service.from("studio_pathway_assets").select("id").eq("pathway_slug", pathway.slug).eq("studio", "video").eq("asset_type", "video-render").contains("metadata", { renderId: render.id }).maybeSingle();
    if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
    const values = {
      pathway_slug: pathway.slug,
      studio: "video",
      asset_type: "video-render",
      parent_asset_id: parentId,
      title: `${pathway.title} · ${String(render.format).toUpperCase()} render`,
      status: render.status === "completed" ? "ready" : "draft",
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
    if (existing.data) await service.from("studio_pathway_assets").update(values).eq("id", existing.data.id);
    else await service.from("studio_pathway_assets").insert({ ...values, created_by: access.user.id, created_at: now });
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
    if (existing.data) await service.from("studio_pathway_assets").update(values).eq("id", existing.data.id);
    else await service.from("studio_pathway_assets").insert({ ...values, created_by: access.user.id, created_at: now });
  }

  return NextResponse.json({ ok: true });
}

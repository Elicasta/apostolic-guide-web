import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { CREATIVE_PUBLICATION_MODES, currentRenderSet, nextAvailablePublishingSlot, publicationStatusForMode } from "@/creative-publishing";
import { executePublication } from "@/creative-publication-executor";
import { loadCreativeProject } from "@/creative-project-server";
import { createServiceClient } from "@/supabase";

const createSchema = z.object({
  projectId: z.string().uuid(),
  platform: z.enum(["instagram"]).default("instagram"),
  mode: z.enum(CREATIVE_PUBLICATION_MODES),
  scheduledFor: z.string().datetime().optional(),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional().default(0),
  manualFinishReason: z.string().trim().max(500).optional(),
  caption: z.string().max(10000).optional()
}).superRefine((value, ctx) => {
  if (value.mode === "schedule" && !value.scheduledFor) ctx.addIssue({ code: "custom", message: "Choose a scheduled time." });
});

const ACTIVE_PUBLICATION_STATUSES = ["scheduled", "publishing", "needs_manual_finish"] as const;

export async function GET() {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const [projectResult, publicationResult] = await Promise.all([
    service.from("studio_creative_projects")
      .select("id,title,pathway_slug,pathway_collection,intent,format,frame_count,status,unified_caption,updated_at")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(300),
    service.from("pathway_publications")
      .select("id,pathway_slug,platform,status,external_post_id,published_url,scheduled_for,published_at,error_message,metadata,creative_project_id,publication_mode,manual_finish_reason,attempt_count,created_at,updated_at,project:studio_creative_projects(id,title,pathway_slug,intent,format,frame_count,status)")
      .not("creative_project_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500)
  ]);
  const error = projectResult.error || publicationResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const publications = publicationResult.data ?? [];
  const activeIds = new Set(publications
    .filter((item) => ACTIVE_PUBLICATION_STATUSES.includes(item.status as typeof ACTIVE_PUBLICATION_STATUSES[number]))
    .map((item) => item.creative_project_id)
    .filter(Boolean));
  const readyProjects = (projectResult.data ?? []).filter((project) => project.status === "ready" && !activeIds.has(project.id));
  const counts = (projectResult.data ?? []).reduce<Record<string, number>>((acc, project) => {
    acc[project.status] = (acc[project.status] ?? 0) + 1;
    return acc;
  }, {});
  return NextResponse.json({ projects: projectResult.data ?? [], readyProjects, publications, counts });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid publication." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    const project = await loadCreativeProject(service, parsed.data.projectId);
    if (!project) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });
    if (!["ready", "published", "failed", "needs_manual_finish"].includes(project.status)) {
      return NextResponse.json({ error: "Mark the Creative Project Ready before publishing it." }, { status: 409 });
    }
    const active = await service.from("pathway_publications")
      .select("id,status,scheduled_for")
      .eq("creative_project_id", project.id)
      .eq("platform", parsed.data.platform)
      .in("status", [...ACTIVE_PUBLICATION_STATUSES])
      .limit(1);
    if (active.error) return NextResponse.json({ error: active.error.message }, { status: 500 });
    if (active.data?.length) return NextResponse.json({ error: "This project already has an active Instagram publication. Finish or resolve it before adding another." }, { status: 409 });

    const links = await service.from("studio_creative_project_assets")
      .select("frame_id,role,sort_order,created_at,asset:studio_pathway_assets(id,public_url,metadata,title,asset_type)")
      .eq("project_id", project.id)
      .in("role", ["cover", "render"])
      .order("created_at", { ascending: false });
    if (links.error) return NextResponse.json({ error: links.error.message }, { status: 500 });
    const renderSet = currentRenderSet((links.data ?? []) as Array<{ frame_id?: string | null; sort_order?: number | null; created_at?: string | null; asset?: { public_url?: string | null; metadata?: Record<string, unknown> | null } | null }>, project.stateVersion, project.editorState.frames.length);
    if (!renderSet.length) return NextResponse.json({ error: "Render the current project version before publishing. Old renders are never substituted silently." }, { status: 409 });

    let scheduledFor: string | null = null;
    if (parsed.data.mode === "publish_now") scheduledFor = new Date().toISOString();
    if (parsed.data.mode === "schedule") {
      const requested = new Date(parsed.data.scheduledFor!);
      if (!Number.isFinite(requested.getTime()) || requested.getTime() <= Date.now()) return NextResponse.json({ error: "Scheduled time must be in the future." }, { status: 400 });
      scheduledFor = requested.toISOString();
    }
    if (parsed.data.mode === "next_available") {
      const occupied = await service.from("pathway_publications")
        .select("scheduled_for")
        .eq("platform", parsed.data.platform)
        .in("status", [...ACTIVE_PUBLICATION_STATUSES])
        .gte("scheduled_for", new Date().toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(200);
      if (occupied.error) return NextResponse.json({ error: occupied.error.message }, { status: 500 });
      scheduledFor = nextAvailablePublishingSlot({
        now: new Date(),
        timezoneOffsetMinutes: parsed.data.timezoneOffsetMinutes,
        occupiedIso: (occupied.data ?? []).map((row) => row.scheduled_for).filter((value): value is string => typeof value === "string")
      });
    }
    if (parsed.data.mode === "finish_manually") scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor).toISOString() : null;

    const media = renderSet.map((link) => {
      const asset = link.asset as { id?: string; public_url?: string | null; title?: string } | null;
      return { frameId: link.frame_id, sortOrder: link.sort_order, assetId: asset?.id, url: asset?.public_url, title: asset?.title };
    });
    const status = publicationStatusForMode(parsed.data.mode);
    const caption = parsed.data.caption ?? project.unifiedCaption;
    const created = await service.from("pathway_publications").insert({
      pathway_slug: project.pathwaySlug,
      asset_id: null,
      platform: parsed.data.platform,
      status,
      scheduled_for: scheduledFor,
      creative_project_id: project.id,
      publication_mode: parsed.data.mode,
      manual_finish_reason: parsed.data.mode === "finish_manually" ? parsed.data.manualFinishReason || "Finish in Instagram for native-only controls or final interactive elements." : null,
      attempt_count: 0,
      metadata: {
        source_kind: "creative_project",
        creative_project_id: project.id,
        project_state_version: project.stateVersion,
        format: project.format,
        intent: project.intent,
        caption,
        frame_asset_ids: media.map((item) => item.assetId).filter(Boolean),
        media_urls: media.map((item) => item.url).filter(Boolean),
        media
      }
    }).select("*").single();
    if (created.error) {
      if (created.error.code === "23505") return NextResponse.json({ error: "This project already has an active Instagram publication. The duplicate request was blocked." }, { status: 409 });
      return NextResponse.json({ error: created.error.message }, { status: 500 });
    }

    const projectStatus = status === "needs_manual_finish" ? "needs_manual_finish" : "scheduled";
    const projectUpdate = await service.from("studio_creative_projects").update({ status: projectStatus, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq("id", project.id);
    if (projectUpdate.error) return NextResponse.json({ error: projectUpdate.error.message }, { status: 500 });

    if (parsed.data.mode === "publish_now") {
      try {
        await executePublication(created.data.id);
      } catch (error) {
        const failed = await service.from("pathway_publications").select("*").eq("id", created.data.id).single();
        return NextResponse.json({ publication: failed.data ?? created.data, error: error instanceof Error ? error.message : "Publishing failed." }, { status: 502 });
      }
      const published = await service.from("pathway_publications").select("*").eq("id", created.data.id).single();
      return NextResponse.json({ publication: published.data ?? created.data });
    }
    return NextResponse.json({ publication: created.data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publication could not be created." }, { status: 500 });
  }
}

import "server-only";
import { createHash } from "node:crypto";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { loadCreativeProject } from "./creative-project-server";
import { FORGE_CAROUSEL_RENDER_ENGINE, renderForgeFrameSvg } from "./forge-carousel-render-engine";
import { createServiceClient } from "./supabase";

type Service = NonNullable<ReturnType<typeof createServiceClient>>;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "creative";
}

async function currentRenderedFrames(service: Service, projectId: string, stateVersion: number) {
  const links = await service.from("studio_creative_project_assets")
    .select("asset_id,frame_id,sort_order,role")
    .eq("project_id", projectId)
    .in("role", ["cover", "render"])
    .order("sort_order", { ascending: true });
  if (links.error) throw new Error(links.error.message);
  const assetIds = (links.data ?? []).map((row) => String(row.asset_id)).filter(Boolean);
  if (!assetIds.length) return new Map<string, Record<string, unknown>>();
  const assets = await service.from("studio_pathway_assets")
    .select("id,public_url,storage_path,metadata")
    .in("id", assetIds);
  if (assets.error) throw new Error(assets.error.message);
  const assetMap = new Map((assets.data ?? []).map((row) => [String(row.id), row as Record<string, unknown>]));
  const byFrame = new Map<string, Record<string, unknown>>();
  for (const link of links.data ?? []) {
    const asset = assetMap.get(String(link.asset_id));
    if (!asset || !link.frame_id) continue;
    const metadata = record(asset.metadata);
    if (Number(metadata.projectStateVersion) !== stateVersion || metadata.renderEngine !== FORGE_CAROUSEL_RENDER_ENGINE) continue;
    byFrame.set(String(link.frame_id), { ...asset, frameId: link.frame_id, sortOrder: link.sort_order });
  }
  return byFrame;
}

async function saveRenderedFrame(input: {
  service: Service;
  project: NonNullable<Awaited<ReturnType<typeof loadCreativeProject>>>;
  frameId: string;
  sortOrder: number;
  title: string;
  altText: string;
  png: Buffer;
  actorUserId?: string | null;
}) {
  const { service, project } = input;
  const sha256 = createHash("sha256").update(input.png).digest("hex");
  const pathname = `creative-projects/${project.pathwaySlug}/${project.id}/renders/v${project.stateVersion}/${String(input.sortOrder + 1).padStart(2, "0")}-${safeName(input.title)}.png`;
  let blob: Awaited<ReturnType<typeof put>> | null = null;
  let assetId: string | null = null;
  try {
    blob = await put(pathname, input.png, { access: "private", contentType: "image/png", addRandomSuffix: true });
    const assetRow: Record<string, unknown> = {
      pathway_slug: project.pathwaySlug,
      studio: "carousel",
      asset_type: "carousel-slide",
      title: input.title.slice(0, 180),
      status: "draft",
      source_type: "rendered",
      editable: false,
      content: { creativeProjectId: project.id, frameId: input.frameId, sortOrder: input.sortOrder },
      storage_bucket: "vercel_blob",
      storage_path: blob.pathname,
      public_url: blob.url,
      metadata: {
        mimeType: "image/png",
        bytes: input.png.length,
        sha256,
        width: 1080,
        height: 1350,
        altText: input.altText,
        creativeProjectId: project.id,
        projectStateVersion: project.stateVersion,
        renderEngine: FORGE_CAROUSEL_RENDER_ENGINE,
        producer: "Forge",
        blobAccess: "private"
      }
    };
    if (input.actorUserId) {
      assetRow.created_by = input.actorUserId;
      assetRow.updated_by = input.actorUserId;
    }
    const asset = await service.from("studio_pathway_assets").insert(assetRow).select("id,public_url,storage_path,metadata").single();
    if (asset.error) throw new Error(asset.error.message);
    assetId = String(asset.data.id);
    const linked = await service.from("studio_creative_project_assets").insert({
      project_id: project.id,
      asset_id: asset.data.id,
      frame_id: input.frameId,
      role: input.sortOrder === 0 ? "cover" : "render",
      sort_order: input.sortOrder
    });
    if (linked.error) throw new Error(linked.error.message);
    return { id: asset.data.id, publicUrl: asset.data.public_url, storagePath: asset.data.storage_path, sha256 };
  } catch (error) {
    if (assetId) {
      try { await service.from("studio_pathway_assets").delete().eq("id", assetId); } catch {}
    }
    if (blob) await del(blob.url).catch(() => undefined);
    throw error;
  }
}

export async function renderForgeCarouselProject(input: {
  projectId: string;
  actorUserId?: string | null;
  onFrame?: (progress: { completed: number; total: number }) => Promise<void> | void;
}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) throw new Error("Vercel Blob is not configured for Forge carousel rendering.");
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const project = await loadCreativeProject(service, input.projectId);
  if (!project) throw new Error("Creative Project not found.");
  if (project.format !== "carousel") throw new Error("Forge carousel renderer only accepts carousel Creative Projects.");
  const frames = project.editorState.frames;
  if (!frames.length) throw new Error("Creative Project has no carousel frames.");

  const existing = await currentRenderedFrames(service, project.id, project.stateVersion);
  const rendered: Array<{ frameId: string; assetId: string; publicUrl: string; storagePath: string; reused: boolean }> = [];
  let completed = 0;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const reused = existing.get(frame.id);
    if (reused?.id && reused.public_url && reused.storage_path) {
      rendered.push({ frameId: frame.id, assetId: String(reused.id), publicUrl: String(reused.public_url), storagePath: String(reused.storage_path), reused: true });
      completed += 1;
      await input.onFrame?.({ completed, total: frames.length });
      continue;
    }
    const svg = renderForgeFrameSvg({ frame, index, total: frames.length, pathwayTitle: project.pathwayTitle, projectTitle: project.title });
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    if (!png.length || png.length > 12 * 1024 * 1024) throw new Error(`Forge rendered slide ${index + 1} outside the 12 MB asset limit.`);
    const saved = await saveRenderedFrame({
      service,
      project,
      frameId: frame.id,
      sortOrder: index,
      title: frame.headline || `${project.title} slide ${index + 1}`,
      altText: frame.altText,
      png,
      actorUserId: input.actorUserId
    });
    rendered.push({ frameId: frame.id, assetId: String(saved.id), publicUrl: String(saved.publicUrl), storagePath: String(saved.storagePath), reused: false });
    completed += 1;
    await input.onFrame?.({ completed, total: frames.length });
  }

  return {
    projectId: project.id,
    pathwaySlug: project.pathwaySlug,
    stateVersion: project.stateVersion,
    renderEngine: FORGE_CAROUSEL_RENDER_ENGINE,
    width: 1080,
    height: 1350,
    rendered,
    renderedCount: rendered.length,
    reusedCount: rendered.filter((item) => item.reused).length
  };
}

async function updateForgeRunRenderEvidence(service: Service, pathwaySlug: string, render: Awaited<ReturnType<typeof renderForgeCarouselProject>>) {
  const run = await service.from("sol_operator_runs")
    .select("id,result")
    .eq("recipe_key", "forge_carousel_stage")
    .eq("pathway_slug", pathwaySlug)
    .eq("status", "waiting_review")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (run.error || !run.data) return;
  const previous = record(run.data.result);
  await service.from("sol_operator_runs").update({
    result: {
      ...previous,
      renderedAssetCount: render.renderedCount,
      renderedAssetIds: render.rendered.map((item) => item.assetId),
      renderEngine: render.renderEngine,
      renderStateVersion: render.stateVersion,
      artworkReady: render.renderedCount > 0
    }
  }).eq("id", run.data.id);
}

export async function renderPendingForgeCarousels(limit = 2) {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) return { configured: false, renderedProjects: 0, renderedSlides: 0, failed: [] as string[] };
  const service = createServiceClient();
  if (!service) return { configured: false, renderedProjects: 0, renderedSlides: 0, failed: [] as string[] };
  const projects = await service.from("studio_creative_projects")
    .select("id,pathway_slug,tags,updated_at")
    .eq("format", "carousel")
    .eq("status", "draft")
    .contains("tags", ["forge", "sol-managed"])
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(5, limit)));
  if (projects.error) throw new Error(projects.error.message);

  let renderedProjects = 0;
  let renderedSlides = 0;
  const failed: string[] = [];
  for (const row of projects.data ?? []) {
    const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
    if (tags.includes("doctrine-blocked")) continue;
    try {
      const render = await renderForgeCarouselProject({ projectId: String(row.id) });
      await updateForgeRunRenderEvidence(service, String(row.pathway_slug), render);
      renderedProjects += render.rendered.some((item) => !item.reused) ? 1 : 0;
      renderedSlides += render.rendered.filter((item) => !item.reused).length;
    } catch (error) {
      failed.push(`${String(row.id)}: ${error instanceof Error ? error.message : "render failed"}`.slice(0, 500));
    }
  }
  return { configured: true, renderedProjects, renderedSlides, failed };
}

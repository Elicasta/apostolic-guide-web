import "server-only";
import { renderForgeCarouselProject } from "./forge-carousel-render";
import { createServiceClient } from "./supabase";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function writeRunEvidence(input: {
  pathwaySlug: string;
  projectId: string;
  stateVersion: number;
  renderEngine: string;
  renderedAssetIds: string[];
}) {
  const service = createServiceClient();
  if (!service) return;
  const run = await service.from("sol_operator_runs")
    .select("id,result")
    .eq("recipe_key", "forge_carousel_stage")
    .eq("pathway_slug", input.pathwaySlug)
    .eq("status", "waiting_review")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (run.error || !run.data) return;
  const previous = record(run.data.result);
  await service.from("sol_operator_runs").update({
    result: {
      ...previous,
      projectId: input.projectId,
      renderedAssetCount: input.renderedAssetIds.length,
      renderedAssetIds: input.renderedAssetIds,
      renderEngine: input.renderEngine,
      renderStateVersion: input.stateVersion,
      artworkReady: input.renderedAssetIds.length > 0
    }
  }).eq("id", run.data.id);
}

export async function drainForgeCarouselRenderQueue(maxNewProjects = 2) {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return { configured: false, inspected: 0, renderedProjects: 0, renderedSlides: 0, failed: [] as string[] };
  }
  const service = createServiceClient();
  if (!service) return { configured: false, inspected: 0, renderedProjects: 0, renderedSlides: 0, failed: [] as string[] };

  const safeMax = Math.max(1, Math.min(4, Math.round(maxNewProjects || 2)));
  const projects = await service.from("studio_creative_projects")
    .select("id,pathway_slug,tags,updated_at")
    .eq("format", "carousel")
    .eq("status", "draft")
    .contains("tags", ["forge", "sol-managed"])
    .order("updated_at", { ascending: false })
    .limit(20);
  if (projects.error) throw new Error(projects.error.message);

  let inspected = 0;
  let renderedProjects = 0;
  let renderedSlides = 0;
  const failed: string[] = [];
  for (const row of projects.data ?? []) {
    if (renderedProjects >= safeMax) break;
    inspected += 1;
    const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
    if (tags.includes("doctrine-blocked")) continue;
    try {
      const render = await renderForgeCarouselProject({ projectId: String(row.id) });
      const newSlides = render.rendered.filter((item) => !item.reused);
      await writeRunEvidence({
        pathwaySlug: String(row.pathway_slug),
        projectId: render.projectId,
        stateVersion: render.stateVersion,
        renderEngine: render.renderEngine,
        renderedAssetIds: render.rendered.map((item) => item.assetId)
      });
      if (!newSlides.length) continue;
      renderedProjects += 1;
      renderedSlides += newSlides.length;
    } catch (error) {
      failed.push(`${String(row.id)}: ${error instanceof Error ? error.message : "render failed"}`.slice(0, 500));
    }
  }

  return { configured: true, inspected, renderedProjects, renderedSlides, failed };
}

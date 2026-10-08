import "server-only";
import { buildEditorialWindow, editorialDate, editorialSourceHash, type EditorialPack } from "./editorial-engine";
import { pathwayBySlug } from "./pathway-catalog";
import { createServiceClient } from "./supabase";

function serviceClient() {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  return service;
}
export async function prepareEditorialWindow() {
  const packs = buildEditorialWindow(editorialDate(), 14).map(pack => ({ ...pack, collection: pathwayBySlug(pack.pathwaySlug)!.collection }));
  const result = await serviceClient().rpc("prepare_editorial_packs", { p_packs: packs });
  if (result.error) throw new Error(result.error.message);
  return { inserted: Number(result.data), start: packs[0].date, end: packs.at(-1)!.date };
}
export async function editorialSnapshot() {
  const service = serviceClient();
  const [settings, packs] = await Promise.all([
    service.from("studio_editorial_settings").select("enabled,updated_at").eq("id", true).single(),
    service.from("studio_editorial_packs").select("production_date,pathway_slug,source_hash,project_id,payload").gte("production_date", editorialDate()).order("production_date").limit(30)
  ]);
  if (settings.error) throw new Error(settings.error.message);
  if (packs.error) throw new Error(packs.error.message);
  const ids = (packs.data ?? []).map(p => p.project_id);
  const projects = ids.length ? await service.from("studio_creative_projects").select("id,status,state_version").in("id", ids) : { data: [], error: null };
  if (projects.error) throw new Error(projects.error.message);
  return { enabled: settings.data.enabled, timezone: "America/New_York", packs: (packs.data ?? []).map(row => {
    const pathway = pathwayBySlug(row.pathway_slug);
    const project = projects.data?.find(p => p.id === row.project_id);
    return { ...row, payload: row.payload as EditorialPack, sourceChanged: !pathway || editorialSourceHash(pathway) !== row.source_hash, projectStatus: project?.status ?? "missing" };
  }) };
}
export async function setEditorialEnabled(enabled: boolean) {
  const result = await serviceClient().from("studio_editorial_settings").update({ enabled, updated_at: new Date().toISOString() }).eq("id", true).select("enabled").single();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

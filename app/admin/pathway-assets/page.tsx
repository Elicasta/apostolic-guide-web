import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { PathwayAssetIndex } from "@/pathway-asset-index";
import { createServiceClient } from "@/supabase";

export default async function AdminPathwayAssetsPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const service = createServiceClient();
  const assetsResult = service ? await service.from("studio_pathway_assets").select("id,pathway_slug,studio,asset_type,parent_asset_id,title,status,source_type,editable,version,storage_path,public_url,updated_at").neq("status","archived").order("updated_at", { ascending: false }).limit(1000) : { data: [], error: null };
  if (assetsResult.error) console.error("pathway asset index load failed", assetsResult.error.message);
  const pathways = allPathways.map((pathway) => ({ slug: pathway.slug, title: pathway.title, collection: pathway.collection }));
  return <PathwayAssetIndex assets={(assetsResult.data ?? []) as Parameters<typeof PathwayAssetIndex>[0]["assets"]} pathways={pathways}/>;
}

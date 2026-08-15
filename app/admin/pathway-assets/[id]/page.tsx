import { notFound, redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { PathwayAssetEditor } from "@/pathway-asset-editor";
import { createServiceClient } from "@/supabase";

export default async function AdminPathwayAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const { id } = await params;
  const service = createServiceClient();
  if (!service) redirect("/admin");

  const [assetResult, versionsResult] = await Promise.all([
    service.from("studio_pathway_assets").select("id,pathway_slug,studio,asset_type,parent_asset_id,title,status,source_type,editable,version,content,storage_bucket,storage_path,public_url,prompt,model,metadata,updated_at").eq("id", id).maybeSingle(),
    service.from("studio_pathway_asset_versions").select("version,created_at").eq("asset_id", id).order("version", { ascending: false }).limit(50)
  ]);
  if (assetResult.error) throw new Error(assetResult.error.message);
  if (!assetResult.data) notFound();
  if (!assetResult.data.editable) redirect(assetResult.data.studio === "video" ? "/admin/video-studio" : "/admin/carousel-studio");
  if (versionsResult.error) console.error("asset version history load failed", versionsResult.error.message);

  return <PathwayAssetEditor initialAsset={assetResult.data as Parameters<typeof PathwayAssetEditor>[0]["initialAsset"]} versions={(versionsResult.data ?? []) as Parameters<typeof PathwayAssetEditor>[0]["versions"]}/>;
}

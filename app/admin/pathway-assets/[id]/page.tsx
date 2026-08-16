import { notFound, redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { PathwayAssetEditor } from "@/pathway-asset-editor";
import { PATHWAY_ASSET_STORAGE_PROVIDER } from "@/pathway-asset-ingest";
import { PathwaySourceAssetViewer } from "@/pathway-source-asset-viewer";
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
  if (versionsResult.error) console.error("asset version history load failed", versionsResult.error.message);

  if (!assetResult.data.editable) {
    let signedUrl = assetResult.data.public_url || null;
    if (!signedUrl && assetResult.data.storage_bucket === PATHWAY_ASSET_STORAGE_PROVIDER && assetResult.data.storage_path) {
      signedUrl = `/api/admin/pathway-assets/file?id=${encodeURIComponent(assetResult.data.id)}`;
    } else if (!signedUrl && assetResult.data.storage_bucket && assetResult.data.storage_path) {
      const signed = await service.storage.from(assetResult.data.storage_bucket).createSignedUrl(assetResult.data.storage_path, 60 * 60);
      if (!signed.error) signedUrl = signed.data.signedUrl;
    }
    return <PathwaySourceAssetViewer asset={assetResult.data as Parameters<typeof PathwaySourceAssetViewer>[0]["asset"]} signedUrl={signedUrl}/>;
  }

  return <PathwayAssetEditor initialAsset={assetResult.data as Parameters<typeof PathwayAssetEditor>[0]["initialAsset"]} versions={(versionsResult.data ?? []) as Parameters<typeof PathwayAssetEditor>[0]["versions"]}/>;
}

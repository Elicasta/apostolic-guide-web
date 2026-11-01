import "server-only";
import type { CodeTheme } from "./carousel-code";
import type { createServiceClient } from "./supabase";
type Service = NonNullable<ReturnType<typeof createServiceClient>>;
export async function hydrateCodeAssets(
  service: Service,
  theme: CodeTheme,
): Promise<CodeTheme> {
  const assets = await Promise.all(
    theme.assets.map(async (asset) => {
      if (!asset.assetId) return asset;
      const r = await service
        .from("studio_pathway_assets")
        .select("storage_bucket,storage_path")
        .eq("id", asset.assetId)
        .single();
      if(r.error)return {...asset,resolvedUrl:undefined};
      const signed = await service.storage
        .from(r.data.storage_bucket)
        .createSignedUrl(r.data.storage_path, 3600);
      if(signed.error)return {...asset,resolvedUrl:undefined};
      return { ...asset, resolvedUrl: signed.data.signedUrl };
    }),
  );
  return { ...theme, assets };
}

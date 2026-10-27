import "server-only";
import {createPrivateBlobDownloadUrl} from "./video-producer-server";
import {stripVideoSceneResolvedUrls,type VideoScenesDocument} from "./video-scenes";
import type {createServiceClient} from "./supabase";

type Service=NonNullable<ReturnType<typeof createServiceClient>>;
/** Re-resolve every graphic reference on read/export; never use hand-edited signed URLs. */
export async function resolveVideoSceneAssetRegistry(service:Service,doc:VideoScenesDocument,ttlMs=30*60*1000):Promise<VideoScenesDocument>{
 const clean=stripVideoSceneResolvedUrls(doc);
 const ids=[...new Set(clean.assets.map(a=>a.assetId).filter((v):v is string=>Boolean(v)))];
 if(!ids.length)return clean;
 const result=await service.from("video_producer_graphic_assets")
  .select("id,active,storage_provider,storage_locator,content_type,formats").eq("active",true).in("id",ids);
 if(result.error)throw new Error("Graphics registry unavailable: "+result.error.message);
 const found=new Map((result.data||[]).map(r=>[r.id,r]));
 const assets=await Promise.all(clean.assets.map(async asset=>{
  if(!asset.assetId)return asset;
  const row=found.get(asset.assetId);
  if(!row||row.storage_provider!=="vercel_blob"||!/^(image\/(png|jpeg|webp))$/.test(String(row.content_type)))
   throw new Error("Graphic "+asset.id+" is not an active raster image in the Graphics Library.");
  const url=await createPrivateBlobDownloadUrl(row.storage_locator,ttlMs);
  return {...asset,resolvedUrl:url};
 }));
 return {...clean,assets};
}

import "server-only";
import type {createServiceClient} from "../supabase";
import {createPrivateBlobDownloadUrl} from "../video-producer-server";
import type {VideoSceneDocument} from "./video-scenes";

type Service=NonNullable<ReturnType<typeof createServiceClient>>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function resolveVideoGraphicAssets(service:Service,doc:VideoSceneDocument,ttlMs=8*60*60*1000):Promise<VideoSceneDocument>{
 if(!doc.assets.length)return doc;
 if(doc.assets.length>20)throw new Error("Video supports up to 20 registered graphics per render.");
 for(const a of doc.assets)if(!UUID.test(a.id)||!["graphic","image"].includes(a.kind)||a.storageLocator)
  throw new Error("Video graphics must use their immutable library IDs.");
 const lookup=await service.from("video_producer_graphic_assets")
  .select("id,storage_provider,storage_locator,content_type,size_bytes,active")
  .in("id",doc.assets.map(a=>a.id)).eq("active",true);
 if(lookup.error)throw new Error(lookup.error.message);
 const assets=new Map((lookup.data||[]).map(row=>[row.id,row]));
 const resolved=await Promise.all(doc.assets.map(async a=>{
  const row=assets.get(a.id);
  if(!row||row.storage_provider!=="vercel_blob"||!row.storage_locator||
   !["image/png","image/webp","image/jpeg"].includes(row.content_type)||
   Number(row.size_bytes)<1||Number(row.size_bytes)>5*1024*1024)
   throw new Error("Graphic asset "+a.id+" was removed, unsupported, or exceeds 5 MB.");
  return {...a,resolvedUrl:await createPrivateBlobDownloadUrl(row.storage_locator,ttlMs)};
 }));
 return {...doc,assets:resolved};
}

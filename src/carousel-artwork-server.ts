import 'server-only';
import type { createServiceClient } from './supabase';
import type { CreativeProjectRecord } from './creative-project-server';
import type { StudioDesign } from './carousel-composition';
import { privateBlobReadUrl } from './private-blob';

/** Read-only compatibility adapter: existing frame designs and saved visual assets. */
export async function loadCarouselArtDirection(service:NonNullable<ReturnType<typeof createServiceClient>>,project:CreativeProjectRecord) {
 const [designs,links]=await Promise.all([
  service.from('studio_creative_frame_designs').select('frame_id,design').eq('project_id',project.id),
  service.from('studio_creative_project_assets').select('frame_id,created_at,asset:studio_pathway_assets(public_url,storage_bucket,storage_path,metadata)').eq('project_id',project.id).eq('role','background').order('created_at',{ascending:false})
 ]);
 if(designs.error||links.error)throw new Error(designs.error?.message||links.error?.message);
 const frameDesigns={...Object.fromEntries((designs.data||[]).map(row=>[row.frame_id,row.design as StudioDesign])),...(project.editorState.visualSettings.frameDesigns as Record<string,StudioDesign>||{})};
 const backgrounds:Record<string,string>={};
 for(const link of links.data||[]) {
  const asset=Array.isArray(link.asset)?link.asset[0]:link.asset;
  const id=String(link.frame_id||'');if(!asset||backgrounds[id])continue;
  if(asset.storage_bucket==='vercel_blob' && (asset.metadata as Record<string,unknown>)?.blobAccess==='private') backgrounds[id]=await privateBlobReadUrl(asset.storage_path);
  else if(asset.storage_bucket && asset.storage_bucket!=='vercel_blob' && asset.storage_path){
   const signed=await service.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path,3600);
   if(signed.error)throw new Error(signed.error.message);backgrounds[id]=signed.data.signedUrl;
  } else if(asset.public_url) backgrounds[id]=asset.public_url;
 }
 return {frameDesigns,backgrounds};
}

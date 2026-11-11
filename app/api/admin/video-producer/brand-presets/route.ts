import {NextResponse} from "next/server";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {getVideoProducerBrand} from "@/video-producer-brand-server";
import {videoSceneDocument} from "@/code-mode/video-scenes";
import {recordStudioAudit} from "@/studio-audit";
export const runtime="nodejs";

const slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const uuid=z.string().uuid();
const create=z.object({action:z.literal("create"),brandSlug:slug,name:z.string().trim().min(1).max(120),document:z.unknown()}).strict();
const update=z.object({action:z.literal("update"),id:uuid,expectedVersion:z.number().int().positive(),
 name:z.string().trim().min(1).max(120).optional(),document:z.unknown()}).strict();
const restore=z.object({action:z.literal("restore"),id:uuid,expectedVersion:z.number().int().positive(),
 restoreVersion:z.number().int().positive()}).strict();
const commands=z.discriminatedUnion("action",[create,update,restore]);
function err(value:string,status=400){return NextResponse.json({error:value},{status});}
async function verifiedDocument(input:unknown){
 const result=videoSceneDocument.safeParse(input);
 if(!result.success)throw new Error(result.error.issues.map(i=>i.path.join(".")+": "+i.message).join("; ").slice(0,1200));
 const document=result.data;
 if(document.assets.some(a=>a.storageLocator||a.resolvedUrl))
  throw new Error("Preset assets must reference only registered IDs, not signed or external URLs.");
 return {...document,expectedUpdatedAt:undefined};
}
export async function GET(request:Request){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed")return err("Forbidden",403);
 const service=createServiceClient();if(!service)return err("Database unavailable",503);
 const url=new URL(request.url);
 const brandSlug=url.searchParams.get("brand")||"";
 if(!slug.safeParse(brandSlug).success)return err("Select a brand profile.");
 try{await getVideoProducerBrand(service,brandSlug);}
 catch(e){return err(e instanceof Error?e.message:"Brand unavailable",409);}
 const result=await service.from("video_producer_brand_presets")
  .select("id,brand_slug,name,document,version,updated_at")
  .eq("brand_slug",brandSlug).order("updated_at",{ascending:false}).limit(100);
 if(result.error)return err(result.error.message,500);
 const presetId=url.searchParams.get("revisions");
 let revisions:unknown[]=[];
 if(presetId&&uuid.safeParse(presetId).success&&result.data?.some(p=>p.id===presetId)){
  const rows=await service.from("video_producer_brand_preset_revisions")
   .select("version,created_at,edited_by")
   .eq("preset_id",presetId).order("version",{ascending:false}).limit(30);
  if(rows.error)return err(rows.error.message,500);
  revisions=rows.data||[];
 }
 return NextResponse.json({presets:result.data||[],revisions});
}
export async function POST(request:Request){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed"||!access.user)return err("Forbidden",403);
 const parsed=commands.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return err(parsed.error.issues[0]?.message||"Invalid preset change");
 const service=createServiceClient();if(!service)return err("Database unavailable",503);
 const command=parsed.data;
 try{
  if(command.action==="create"){
   await getVideoProducerBrand(service,command.brandSlug);
   const document=await verifiedDocument(command.document);
   const saved=await service.from("video_producer_brand_presets")
    .insert({brand_slug:command.brandSlug,name:command.name,document,version:1,created_by:access.user.id})
    .select("id,brand_slug,name,document,version,updated_at").single();
   if(saved.error)throw new Error(saved.error.message);
   await recordStudioAudit({actorUserId:access.user.id,action:"video_producer.brand_preset.created",resourceType:"video",metadata:{presetId:saved.data.id,brandSlug:command.brandSlug}});
   return NextResponse.json({preset:saved.data},{status:201});
  }
  const prior=await service.from("video_producer_brand_presets")
   .select("id,brand_slug,name,document,version,updated_at").eq("id",command.id).maybeSingle();
  if(prior.error)throw new Error(prior.error.message);
  if(!prior.data)return err("Preset not found",404);
  await getVideoProducerBrand(service,prior.data.brand_slug);
  if(prior.data.version!==command.expectedVersion)return err("Preset changed. Reload before applying.",409);
  let document;
  if(command.action==="restore"){
   const revision=await service.from("video_producer_brand_preset_revisions")
    .select("previous_document").eq("preset_id",command.id)
    .eq("version",command.restoreVersion).maybeSingle();
   if(revision.error)throw new Error(revision.error.message);
   if(!revision.data)return err("Revision not found. Nothing changed.",404);
   document=await verifiedDocument(revision.data.previous_document);
  }else document=await verifiedDocument(command.document);
  const checkpoint=await service.from("video_producer_brand_preset_revisions").insert({
   preset_id:command.id,version:prior.data.version,
   previous_document:prior.data.document,edited_by:access.user.id
  }).select("id").single();
  if(checkpoint.error)return err("Could not save undo revision. Nothing changed: "+checkpoint.error.message,409);
  const updateResult=await service.from("video_producer_brand_presets").update({
   document,name:command.action==="update"?(command.name??prior.data.name):prior.data.name,
   version:prior.data.version+1,updated_at:new Date().toISOString()
  }).eq("id",command.id).eq("version",command.expectedVersion)
   .select("id,brand_slug,name,document,version,updated_at").maybeSingle();
  if(updateResult.error||!updateResult.data){
   await service.from("video_producer_brand_preset_revisions").delete().eq("id",checkpoint.data.id);
   return err(updateResult.error?.message||"Concurrent change. Reload and retry.",409);
  }
  await recordStudioAudit({actorUserId:access.user.id,action:"video_producer.brand_preset."+(command.action==="restore"?"restored":"updated"),resourceType:"video",metadata:{presetId:command.id,oldVersion:prior.data.version,newVersion:updateResult.data.version}});
  return NextResponse.json({preset:updateResult.data,checkpoint:true});
 }catch(e){return err(e instanceof Error?e.message:"Could not save preset",409);}
}

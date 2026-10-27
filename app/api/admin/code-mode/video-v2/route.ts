import {NextResponse} from "next/server";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {recordStudioAudit} from "@/studio-audit";
import {videoSceneDocument,videoSceneStarter,type VideoSceneDocument} from "@/code-mode/video-scenes";
import {normalizeVideoProducerTranscript,sliceVideoProducerTranscript} from "@/video-producer-ai";
import {compileVideoProducerRenderPlan} from "@/video-producer";
import {wordsOnOutput} from "@/code-mode/video-word-sync";
import {createPrivateBlobDownloadUrl} from "@/video-producer-server";
import {z} from "zod";

export const runtime="nodejs";
const idSchema=z.string().uuid();
const slugSchema=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const writableProducer=new Set(["draft","uploaded","planned"]);
function responseError(message:string,status=409){return NextResponse.json({error:message},{status})}
function record(v:unknown):Record<string,unknown>{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{}}
function starter(kind:"producer"|"studio",id:string,duration=30):VideoSceneDocument{
 const s=videoSceneStarter("scene-1");
 return {tool:"video",version:2,kind,id,format:{w:1080,h:1920,fps:30},assets:[],
 style:{preset:"AG Editorial",ink:"#10202A",paper:"#F5F7F4",crimson:"#A12D3D"},
 scenes:[{...s,end:Math.min(Math.max(duration,1),3)}]};
}
function extract(row:Record<string,unknown>,kind:"producer"|"studio",id:string):VideoSceneDocument{
 const holder=record(kind==="producer"?row.director_metadata:row.style);
 const persisted=holder.kineticSceneV2;
 const source=videoSceneDocument.safeParse(persisted);
 const result=source.success?source.data:starter(kind,id,Number(row.source_duration||30));
 return {...result,kind,id,expectedUpdatedAt:String(row.updated_at)};
}
export async function GET(request:Request){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed"||!access.user)return responseError("Forbidden",403);
 const url=new URL(request.url),kind=url.searchParams.get("kind"),id=url.searchParams.get("id")||"";
 if(kind!=="producer"&&kind!=="studio")return responseError("Select a Video Studio or Producer project.",400);
 if(!(kind==="producer"?idSchema:slugSchema).safeParse(id).success)return responseError("Invalid project ID.",400);
 const s=createServiceClient();if(!s)return responseError("Draft database unavailable.",503);
 const table=kind==="producer"?"video_producer_projects":"pathway_video_projects";
 const query=s.from(table).select("*").eq(kind==="producer"?"id":"pathway_slug",id);
 const r=kind==="producer"?await query.is("deleted_at",null).maybeSingle():await query.maybeSingle();
 if(r.error)return responseError(r.error.message,500);
 if(!r.data)return responseError("Video project not found.",404);
 const row=r.data as Record<string,unknown>;
 const status=String(row.status||"draft");
 const previous=await s.from("studio_code_mode_checkpoints").select("id,created_at").eq("tool","video").eq("source_id",id).order("created_at",{ascending:false}).limit(25);
 if(previous.error)return responseError(previous.error.message,500);
 const versionId=url.searchParams.get("checkpoint")||"";
 let document=extract(row,kind,id);
 if(versionId){
  if(!idSchema.safeParse(versionId).success)return responseError("Invalid checkpoint.",400);
  const snapshot=await s.from("studio_code_mode_checkpoints").select("document").eq("tool","video").eq("source_id",id).eq("id",versionId).maybeSingle();
  if(snapshot.error)return responseError(snapshot.error.message,500);
  if(!snapshot.data)return responseError("Checkpoint not found.",404);
  const restored=extract(record(snapshot.data.document),kind,id);
  document={...restored,expectedUpdatedAt:String(row.updated_at)};
 }
 let previewSourceUrl:string|null=null;
 let transcriptLane:Array<{word:string;start:number;end:number}>=[];
 let keptRanges:Array<{start:number;end:number}>=[];
 if(kind==="producer"){
  const sourceTranscript=normalizeVideoProducerTranscript(row.transcript);
  const rangeStart=Number(row.source_range_start??0),rangeEnd=Number(row.source_range_end??row.source_duration??0);
  const local=(rangeEnd>rangeStart && row.source_range_start!=null)?sliceVideoProducerTranscript(sourceTranscript,rangeStart,rangeEnd):sourceTranscript;
  try{
   const plan=row.edit_plan?compileVideoProducerRenderPlan(row.edit_plan as Parameters<typeof compileVideoProducerRenderPlan>[0]):null;
   keptRanges=plan?.keepSegments||[];
   transcriptLane=keptRanges.length?wordsOnOutput(local.words,keptRanges):local.words;
  }catch{transcriptLane=local.words;}
  if(row.source_provider==="vercel_blob"&&row.source_locator){
   try{previewSourceUrl=await createPrivateBlobDownloadUrl(String(row.source_locator),30*60*1000)}catch{previewSourceUrl=null}
  }
 }
 return NextResponse.json({document,readOnly:kind==="producer"&&!writableProducer.has(status),projectStatus:status,
  previewSourceUrl,sourceOffset:kind==="producer"?Number(row.source_range_start??0):0,transcriptLane,keptRanges,
  history:(previous.data||[]).map(h=>({id:h.id,createdAt:h.created_at}))});
}
export async function POST(request:Request){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed"||!access.user)return responseError("Forbidden",403);
 let input:unknown;try{input=await request.json()}catch{return responseError("Invalid JSON.",400)}
 const parsed=videoSceneDocument.safeParse(input);
 if(!parsed.success)return responseError(parsed.error.issues.map(i=>i.path.join(".")+": "+i.message).join("; ").slice(0,1500),400);
 const doc=parsed.data;
 if(!(doc.kind==="producer"?idSchema:slugSchema).safeParse(doc.id).success)return responseError("Invalid project identifier.",400);
 if(!doc.expectedUpdatedAt)return responseError("Reload the latest project before applying.",409);
 const s=createServiceClient();if(!s)return responseError("Draft database unavailable.",503);
 const table=doc.kind==="producer"?"video_producer_projects":"pathway_video_projects",key=doc.kind==="producer"?"id":"pathway_slug";
 const query=s.from(table).select("*").eq(key,doc.id);
 const r=doc.kind==="producer"?await query.is("deleted_at",null).maybeSingle():await query.maybeSingle();
 if(r.error)return responseError(r.error.message,500);
 if(!r.data)return responseError("Video project not found.",404);
 const row=r.data as Record<string,unknown>;
 if(new Date(String(row.updated_at)).getTime()!==new Date(doc.expectedUpdatedAt).getTime())return responseError("Project has changed. Reload before applying.",409);
 if(doc.kind==="producer"&&!writableProducer.has(String(row.status)))return responseError("Ready, Scheduled and rendering projects are read-only. Return to the approved editing workflow.",409);
 if(doc.kind==="studio"){
  const active=await s.from("pathway_video_renders").select("id").eq("pathway_slug",doc.id).in("status",["queued","rendering"]).limit(1);
  if(active.error)return responseError(active.error.message,500);
  if(active.data?.length)return responseError("Cannot modify scenes during an active render.",409);
 }
 // Scene editing is allowed only with data that doesn't load executable resources.
 // Assets are registry IDs; arbitrary resolvedUrl values are never persisted.
 if(doc.assets.some(a=>a.resolvedUrl||a.storageLocator))return responseError("Asset URLs cannot be hand-edited. Use registered IDs.",400);
 if(doc.assets.some(a=>!(a.kind==="graphic"||a.kind==="image")||!idSchema.safeParse(a.id).success))
  return responseError("Only registered graphic/image UUIDs can be attached to a scene.",400);
 if(doc.assets.length){
  const assets=await s.from("video_producer_graphic_assets").select("id,content_type,size_bytes,active").in("id",doc.assets.map(a=>a.id)).eq("active",true);
  if(assets.error)return responseError(assets.error.message,500);
  if(!assets.data||assets.data.length!==doc.assets.length||assets.data.some(a=>!["image/png","image/webp","image/jpeg"].includes(a.content_type)||Number(a.size_bytes)>5*1024*1024))
   return responseError("A selected graphic is unavailable, unsupported, or larger than 5 MB.",409);
 }
 const saved={...doc,expectedUpdatedAt:undefined};
 const data=record(doc.kind==="producer"?row.director_metadata:row.style);
 const newMetadata={...data,kineticSceneV2:saved,kineticDoctrineStatus:"not_checked"};
 // Checkpoint previous state on every successful Apply attempt.
 const checkpoint=await s.from("studio_code_mode_checkpoints").insert({tool:"video",source_id:doc.id,actor_user_id:access.user.id,document:row});
 if(checkpoint.error)return responseError("Could not create undo checkpoint: "+checkpoint.error.message,500);
 const update=doc.kind==="producer"?
  {director_metadata:newMetadata,status:row.edit_plan?"planned":row.status,approval_fingerprint:null,approved_at:null,updated_by:access.user.id,updated_at:new Date().toISOString()}:
  {style:newMetadata,updated_by:access.user.id,updated_at:new Date().toISOString()};
 const applied=await s.from(table).update(update).eq(key,doc.id).eq("updated_at",row.updated_at).select("*").maybeSingle();
 if(applied.error)return responseError(applied.error.message,500);
 if(!applied.data)return responseError("Concurrent project edit detected. Reload and try again.",409);
 await recordStudioAudit({actorUserId:access.user.id,action:"code_mode.video.scene_applied",resourceType:"video",resourceId:doc.kind==="producer"?doc.id:null,metadata:{sourceId:doc.id,kind:doc.kind,version:2,draftOnly:true}});
 return NextResponse.json({ok:true,document:extract(applied.data as Record<string,unknown>,doc.kind,doc.id),notice:"Scene draft saved. Previous approvals are invalidated; review and approve before rendering."});
}

import {randomUUID} from "node:crypto";
import {head} from "@vercel/blob";
import {NextResponse} from "next/server";
import {z} from "zod";
import {createServiceClient} from "@/supabase";
import {getVideoProducerBrand} from "@/video-producer-brand-server";
import {authenticateVideoAgent} from "@/video-producer-agent-server";
import {ACTION_SCOPE,isVideoAgentAction,isVideoProducerAgentEditable} from "@/video-producer-agent-policy";
import {
 createPrivateBlobDownloadUrl,createPrivateBlobUploadUrl,createWorkerCallbackToken,
 dispatchVideoProducerWorker,storeVideoProducerManifest,videoProducerRendererCredentials,videoProducerWorkerRef
} from "@/video-producer-server";
import {videoSceneDocument} from "@/code-mode/video-scenes";
import {recordStudioAudit} from "@/studio-audit";
export const runtime="nodejs";
export const maxDuration=60;

const id=z.string().uuid();
const createProject=z.object({action:z.literal("createProject"),title:z.string().trim().min(1).max(180),
 brandProfile:z.string().min(1).max(80),mode:z.enum(["podcast","reels"]).default("podcast"),
 pathwaySlug:z.string().max(120).nullable().optional()}).strict();
const applyTimeline=z.object({action:z.literal("applyTimeline"),projectId:id,document:z.unknown()}).strict();
const authorizeAsset=z.object({action:z.literal("authorizeAsset"),projectId:id,filename:z.string().trim().min(1).max(180),
 contentType:z.enum(["image/png","image/jpeg","image/webp"]),size:z.number().int().min(1).max(5*1024*1024)}).strict();
const commitAsset=z.object({action:z.literal("commitAsset"),projectId:id,uploadId:id}).strict();
const requestPreview=z.object({action:z.literal("requestPreview"),projectId:id}).strict();
const commands=z.discriminatedUnion("action",[createProject,applyTimeline,authorizeAsset,commitAsset,requestPreview]);

function failure(message:string,status=400){return NextResponse.json({error:message},{status});}
async function projectForAgent(service:NonNullable<ReturnType<typeof createServiceClient>>,projectId:string,userId:string){
 const response=await service.from("video_producer_projects").select("*")
  .eq("id",projectId).eq("created_by",userId).is("deleted_at",null).maybeSingle();
 if(response.error)throw new Error(response.error.message);
 if(!response.data)throw new Error("Project not found for this agent token owner.");
 return response.data as Record<string,unknown>;
}
async function validateAssets(service:NonNullable<ReturnType<typeof createServiceClient>>,doc:ReturnType<typeof videoSceneDocument.parse>){
 if(doc.assets.some(a=>a.resolvedUrl||a.storageLocator||!id.safeParse(a.id).success||!["graphic","image"].includes(a.kind)))
  throw new Error("Scenes may reference only registered asset UUIDs, never external URLs.");
 if(!doc.assets.length)return;
 const result=await service.from("video_producer_graphic_assets").select("id,content_type,size_bytes,active")
  .in("id",doc.assets.map(a=>a.id)).eq("active",true);
 if(result.error)throw new Error(result.error.message);
 if((result.data||[]).length!==doc.assets.length||result.data?.some(a=>Number(a.size_bytes)>5*1024*1024||!["image/jpeg","image/png","image/webp"].includes(a.content_type)))
  throw new Error("A required graphic is unavailable, unsupported or larger than 5 MB.");
}

export async function GET(request:Request){
 const service=createServiceClient();if(!service)return failure("Database unavailable",503);
 const agent=await authenticateVideoAgent(request,service,"draft:read");
 if(!agent)return failure("Agent token missing, expired or lacks draft:read.",401);
 const projectId=new URL(request.url).searchParams.get("projectId")||"";
 if(!id.safeParse(projectId).success)return failure("Invalid project ID");
 try{
  const project=await projectForAgent(service,projectId,agent.created_by);
  const previews=await service.from("video_producer_agent_previews")
   .select("id,status,error,requested_at,completed_at,output_storage_path,expires_at")
   .eq("project_id",projectId).eq("agent_token_id",agent.id).order("requested_at",{ascending:false}).limit(5);
  if(previews.error)throw new Error(previews.error.message);
  const recent=await Promise.all((previews.data||[]).map(async p=>({
   id:p.id,status:p.status,error:p.error,requestedAt:p.requested_at,completedAt:p.completed_at,
   url:p.status==="completed"&&new Date(p.expires_at)>new Date()?
    await createPrivateBlobDownloadUrl(p.output_storage_path,30*60*1000):null
  })));
  return NextResponse.json({project:{id:project.id,title:project.title,status:project.status,
    brandProfile:project.brand_profile,mode:project.mode,updatedAt:project.updated_at,
    hasSavedTimeline:Boolean((project.director_metadata as Record<string,unknown>|null)?.kineticSceneV2),
    isEditable:isVideoProducerAgentEditable({status:String(project.status),approval_fingerprint:project.approval_fingerprint as string|null})},
   previews:recent});
 }catch(error){return failure(error instanceof Error?error.message:"Could not read project",404);}
}

export async function POST(request:Request){
 const service=createServiceClient();if(!service)return failure("Database unavailable",503);
 const data=await request.json().catch(()=>null);
 if(!data||typeof data!=="object"||Array.isArray(data)||!isVideoAgentAction(String((data as Record<string,unknown>).action||"")))
  return failure("Unsupported draft agent action.");
 const parsed=commands.safeParse(data);
 if(!parsed.success)return failure("Invalid draft agent request: "+parsed.error.issues[0]?.message);
 const scope=ACTION_SCOPE[parsed.data.action];
 const agent=await authenticateVideoAgent(request,service,scope);
 if(!agent)return failure("Agent token missing, expired or lacks "+scope+".",401);
 try{
  const action=parsed.data;
  if(action.action==="createProject"){
   const profile=await getVideoProducerBrand(service,action.brandProfile);
   if(action.pathwaySlug&&profile.slug==="in-the-now")throw new Error("The personal profile does not require a pathway.");
   const created=await service.from("video_producer_projects").insert({
    title:action.title,mode:action.mode,brand_profile:profile.slug,status:"draft",
    pathway_slug:action.pathwaySlug||null,created_by:agent.created_by,updated_by:agent.created_by,
    source_provider:null
   }).select("id,title,status,brand_profile,updated_at").single();
   if(created.error)throw new Error(created.error.message);
   await recordStudioAudit({actorUserId:agent.created_by,action:"video_producer.agent.project_created",resourceType:"video",resourceId:created.data.id,metadata:{tokenId:agent.id}});
   return NextResponse.json({project:created.data},{status:201});
  }
  const project=await projectForAgent(service,action.projectId,agent.created_by);
  if(!isVideoProducerAgentEditable({status:String(project.status),approval_fingerprint:project.approval_fingerprint as string|null}))
   return failure("This project has passed the draft boundary. Agents cannot modify approved, rendering, scheduled or published work.",409);

  if(action.action==="applyTimeline"){
   const result=videoSceneDocument.safeParse(action.document);
   if(!result.success)return failure(result.error.issues.map(i=>i.path.join(".")+": "+i.message).join("; ").slice(0,1300));
   const document=result.data;
   if(document.kind!=="producer"||document.id!==action.projectId)return failure("Timeline must belong to this producer project.");
   if(!document.expectedUpdatedAt||new Date(document.expectedUpdatedAt).getTime()!==new Date(String(project.updated_at)).getTime())
    return failure("Timeline is stale. Read status and reload the saved project revision.",409);
   await validateAssets(service,document);
   const previous=project.director_metadata&&typeof project.director_metadata==="object"?project.director_metadata as Record<string,unknown>:{};
   const checkpoint=await service.from("studio_code_mode_checkpoints").insert({
    tool:"video",source_id:action.projectId,actor_user_id:agent.created_by,document:project
   });
   if(checkpoint.error)throw new Error("Timeline not changed because an undo checkpoint could not be saved: "+checkpoint.error.message);
   const clean={...document,expectedUpdatedAt:undefined};
   const saved=await service.from("video_producer_projects").update({
    director_metadata:{...previous,kineticSceneV2:clean,kineticDoctrineStatus:"not_checked"},
    status:project.edit_plan?"planned":project.status,
    approval_fingerprint:null,approved_at:null,updated_by:agent.created_by,
    updated_at:new Date().toISOString()
   }).eq("id",action.projectId).eq("updated_at",project.updated_at).select("id,updated_at,status").maybeSingle();
   if(saved.error)throw new Error(saved.error.message);
   if(!saved.data)return failure("Concurrent project edit. No timeline was applied.",409);
   await recordStudioAudit({actorUserId:agent.created_by,action:"video_producer.agent.timeline_applied",resourceType:"video",resourceId:action.projectId,metadata:{tokenId:agent.id,checkpoint:true}});
   return NextResponse.json({ok:true,revision:saved.data.updated_at,checkpoint:true,draftOnly:true});
  }
  if(action.action==="authorizeAsset"){
   const assetId=randomUUID();
   const ext=action.contentType==="image/png"?"png":action.contentType==="image/webp"?"webp":"jpg";
   const path=`video-producer/agent-assets/${action.projectId}/${assetId}.${ext}`;
   const expiresAt=new Date(Date.now()+15*60*1000).toISOString();
   const row=await service.from("video_producer_agent_asset_uploads").insert({
    id:assetId,project_id:action.projectId,agent_token_id:agent.id,
    pathname:path,filename:action.filename,content_type:action.contentType,
    byte_size:action.size,expires_at:expiresAt
   }).select("id").single();
   if(row.error)throw new Error(row.error.message);
   const uploadUrl=await createPrivateBlobUploadUrl({pathname:path,contentType:action.contentType,maxBytes:action.size,ttlMs:15*60*1000});
   return NextResponse.json({uploadId:assetId,uploadUrl,expiresAt,private:true});
  }
  if(action.action==="commitAsset"){
   const upload=await service.from("video_producer_agent_asset_uploads").select("*")
    .eq("id",action.uploadId).eq("project_id",action.projectId).eq("agent_token_id",agent.id).maybeSingle();
   if(upload.error||!upload.data||upload.data.status!=="issued"||new Date(upload.data.expires_at)<new Date())
    return failure("Upload token expired or already registered. Request a new private asset upload.",409);
   const blob=await head(upload.data.pathname);
   if(blob.size<1||blob.size>Number(upload.data.byte_size)||blob.contentType!==upload.data.content_type)
    return failure("Uploaded media does not match the authorized MIME type or maximum size.",409);
   const inserted=await service.from("video_producer_graphic_assets").insert({
    id:upload.data.id,title:upload.data.filename,kind:"overlay",storage_provider:"vercel_blob",
    storage_locator:upload.data.pathname,filename:upload.data.filename,
    content_type:upload.data.content_type,size_bytes:blob.size,
    created_by:agent.created_by,updated_by:agent.created_by,active:true
   }).select("id").single();
   if(inserted.error)throw new Error(inserted.error.message);
   await service.from("video_producer_agent_asset_uploads").update({status:"registered"}).eq("id",upload.data.id);
   return NextResponse.json({assetId:upload.data.id,private:true});
  }
  if(action.action==="requestPreview"){
   const saved=(project.director_metadata as Record<string,unknown>|null)?.kineticSceneV2;
   const doc=videoSceneDocument.safeParse(saved);
   if(!doc.success)return failure("Save a valid timeline JSON draft before requesting a preview.",409);
   if(!project.source_locator||project.source_provider!=="vercel_blob")return failure("A private source recording must be uploaded before preview.",409);
   const duration=Number(project.source_range_end||project.source_duration||0)-Number(project.source_range_start||0);
   if(duration<=0)return failure("Source duration has not been verified.",409);
   const jobId=randomUUID(),callback=createWorkerCallbackToken();
   const outputPath=`video-producer/agent-previews/${action.projectId}/${jobId}.mp4`;
   const ttl=3*60*60*1000;
   const outputUrl=await createPrivateBlobUploadUrl({pathname:outputPath,contentType:"video/mp4",maxBytes:300*1024*1024,ttlMs:ttl});
   const sourceUrl=await createPrivateBlobDownloadUrl(String(project.source_locator),ttl);
   const documentPath=`video-producer/agent-previews/${action.projectId}/${jobId}-scene.json`;
   const jsonBlob=await storeVideoProducerManifest(documentPath,doc.data);
   const documentUrl=await createPrivateBlobDownloadUrl(jsonBlob.pathname,ttl);
   const row=await service.from("video_producer_agent_previews").insert({
    id:jobId,project_id:action.projectId,agent_token_id:agent.id,
    status:"queued",source_revision:String(project.updated_at),
    output_storage_path:outputPath,callback_token_hash:callback.hash,
    expires_at:new Date(Date.now()+ttl).toISOString()
   });
   if(row.error)throw new Error(row.error.message);
   try{
    const {token,repository}=await videoProducerRendererCredentials(service);
    if(!token)throw new Error("GitHub worker is not connected. Check VIDEO_STUDIO_GITHUB_TOKEN.");
    await dispatchVideoProducerWorker({
     token,repository,eventType:"video-producer-agent-preview",payload:{
      job_id:jobId,project_id:action.projectId,worker_ref:videoProducerWorkerRef(),
      source_url:sourceUrl,document_url:documentUrl,output_upload_url:outputUrl,
      source_offset:Number(project.source_range_start||0),duration:Math.min(duration,10),
      callback_url:new URL("/api/admin/video-producer/agent/preview-callback",request.url).toString(),
      callback_token:callback.token
     }
    });
    return NextResponse.json({jobId,status:"queued",previewSeconds:Math.min(duration,10)},{status:202});
   }catch(error){
    await service.from("video_producer_agent_previews").update({status:"failed",error:error instanceof Error?error.message:"Worker unavailable",completed_at:new Date().toISOString()}).eq("id",jobId);
    throw error;
   }
  }
  return failure("Unsupported action");
 }catch(error){return failure(error instanceof Error?error.message:"Agent draft operation failed",409);}
}

import {resolveVideoSceneAssetRegistry} from "@/video-scenes-server";
import {freshVideoScenes,videoScenesSchema,stripVideoSceneResolvedUrls} from "@/video-scenes";
import {normalizeVideoProducerTranscript,sliceVideoProducerTranscript} from "@/video-producer-ai";
import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {recordStudioAudit} from "@/studio-audit";
import {wholeItemSchema,initialWholeItem,type WholeItemCode} from "@/code-mode/whole-item";
import {normalizeEditorState} from "@/creative-project";
import {pathwayBySlug} from "@/pathway-catalog";
export const runtime="nodejs";
type Service=NonNullable<ReturnType<typeof createServiceClient>>;
async function checkpoint(s:Service,actor:string,tool:string,source:string,previous:unknown){
 const row=await s.from("studio_code_mode_checkpoints").insert({tool,source_id:source,actor_user_id:actor,document:previous});
 if(row.error)throw new Error("Cannot checkpoint existing draft: "+row.error.message);
}
function fail(error:unknown,status=409){return NextResponse.json({error:error instanceof Error?error.message:"Draft operation rejected."},{status});}
function matchDate(current:string|undefined,expected:string|undefined){
 if(!expected||!current||new Date(expected).getTime()!==new Date(current).getTime())throw new Error("Draft has changed. Reload the current version first.");
}
const uuid=z.string().uuid();
function bodyText(document:unknown){
 const blocks=(document as {blocks?:Array<{data?:{text?:unknown}}>})?.blocks;
 return Array.isArray(blocks)?blocks.map(b=>typeof b.data?.text==="string"?b.data.text:"").join("\n\n"):"";
}
export async function GET(request:Request){
 const {access,allowed}=await getStudioPermission("manage_content");if(!allowed||access.state!=="allowed"||!access.user)return fail("Forbidden",403);
 const url=new URL(request.url),tool=url.searchParams.get("tool"),id=url.searchParams.get("id")||"",kind=url.searchParams.get("kind")||"script",v2=url.searchParams.get("version")==="2";
 if(!["website","content_engine","episode","audio","teleprompter","video"].includes(tool||""))return fail("Invalid tool",400);
 if(!id)return NextResponse.json({document:v2&&tool==="video"?freshVideoScenes(kind==="producer"?"producer":"studio",""):initialWholeItem(tool as WholeItemCode["tool"])});
 const s=createServiceClient();if(!s)return fail("Draft database unavailable",503);
 try{
  if(tool==="website"){
   if(!uuid.safeParse(id).success)throw new Error("Invalid website content ID.");
   const r=await s.schema("content").from("items").select("id,kind,slug,title,summary,editorial_status,source_system,updated_at,documents(body_json),publications(channel,status)").eq("id",id).maybeSingle();
   if(r.error||!r.data||r.data.source_system!=="website"||r.data.editorial_status!=="draft")throw new Error("Only website drafts can be edited in Code Mode.");
   const publication=r.data.publications as unknown as Array<{channel:string;status:string}>||[];
   if(publication.some(p=>p.channel==="website"&&p.status==="published"))throw new Error("Published website content cannot be edited in Code Mode.");
   const docs=r.data.documents as unknown as {body_json?:unknown}|null;
   return NextResponse.json({document:{tool,version:1,id,kind:r.data.kind,title:r.data.title,slug:r.data.slug,summary:r.data.summary,body:bodyText(docs?.body_json),expectedUpdatedAt:r.data.updated_at}});
  }
  if(tool==="content_engine"){
   const pack=await s.from("studio_editorial_packs").select("production_date,project_id,payload").eq("production_date",id).maybeSingle();
   if(pack.error||!pack.data)throw new Error("Content Engine pack not found.");
   const project=await s.from("studio_creative_projects").select("status,state_version").eq("id",pack.data.project_id).single();
   if(project.error||project.data.status!=="draft")throw new Error("The linked Creative Project is not a draft.");
   const p=pack.data.payload as Record<string,unknown>;
   return NextResponse.json({document:{tool,version:1,productionDate:id,expectedStateVersion:project.data.state_version,title:p.title,caption:p.caption,artDirection:p.artDirection,frames:p.frames,newsletter:p.newsletter||null}});
  }
  if(tool==="episode"){
   if(!uuid.safeParse(id).success)throw new Error("Invalid episode ID.");
   const isArticle=kind==="article",table=isArticle?"studio_episode_articles":"video_producer_episode_scripts";
   let q=s.from(table).select("*");
   q=isArticle?q.eq("episode_id",id):q.eq("id",id);
   const r=await q.maybeSingle();
   if(r.error||!r.data||r.data.status!=="draft")throw new Error("Only existing draft episodes can be edited.");
   return NextResponse.json({document:{tool,version:1,kind:isArticle?"article":"script",id,title:r.data.title,body:isArticle?r.data.body:r.data.script_text,premise:isArticle?undefined:r.data.premise,expectedUpdatedAt:r.data.updated_at}});
  }
  if(tool==="audio"){
   const r=await s.from("pathway_audio_scripts").select("*").eq("pathway_slug",id).maybeSingle();
   if(r.error||!r.data||r.data.status!=="draft")throw new Error("Only draft audio scripts can be edited.");
   return NextResponse.json({document:{tool,version:1,pathwaySlug:id,scriptText:r.data.script_text,expectedUpdatedAt:r.data.updated_at}});
  }
  if(tool==="teleprompter"){
   if(!uuid.safeParse(id).success)throw new Error("Invalid teleprompter draft ID.");
   const r=await s.from("studio_teleprompter_code_drafts").select("*").eq("id",id).eq("owner_id",access.user.id).maybeSingle();
   if(r.error||!r.data)throw new Error("Private teleprompter draft not found.");
   return NextResponse.json({document:{tool,version:1,id,title:r.data.title,scriptText:r.data.script_text,notes:r.data.notes,expectedUpdatedAt:r.data.updated_at}});
  }
  const isProducer=kind==="producer",table=isProducer?"video_producer_projects":"pathway_video_projects";
  const r=await s.from(table).select("*").eq(isProducer?"id":"pathway_slug",id).maybeSingle();
  if(r.error||!r.data)throw new Error("Video project not found.");
  if(isProducer&&r.data.status!=="draft"&&!v2)throw new Error("Video Producer project is not a draft.");
  if(v2){
   const storage=isProducer?(r.data.director_metadata||{}):(r.data.style||{});
   const persisted=storage.sceneProgram;
   const document=persisted&&videoScenesSchema.safeParse(persisted).success?persisted:freshVideoScenes(isProducer?"producer":"studio",id);
   const signedDocument=await resolveVideoSceneAssetRegistry(s,videoScenesSchema.parse(document));
   const transcript=isProducer?normalizeVideoProducerTranscript(r.data.transcript):null;
   const words=transcript?(r.data.source_range_start!=null&&r.data.source_range_end!=null?
      sliceVideoProducerTranscript(transcript,Number(r.data.source_range_start),Number(r.data.source_range_end)).words:transcript.words):[];
   const status=String(r.data.status||"draft");
   return NextResponse.json({document:{...signedDocument,expectedUpdatedAt:r.data.updated_at},words,status,
    readOnly:isProducer&&["rendering","review","completed","ready","scheduled"].includes(status)});
  }
  return NextResponse.json({document:isProducer?{tool,version:1,kind:"producer",id,title:r.data.title,directorMetadata:r.data.director_metadata,expectedUpdatedAt:r.data.updated_at}:{tool,version:1,kind:"studio",id,timeline:r.data.timeline,style:r.data.style,expectedUpdatedAt:r.data.updated_at}});
 }catch(error){return fail(error);}
}
export async function POST(request:Request){
 const {access,allowed}=await getStudioPermission("manage_content");if(!allowed||access.state!=="allowed"||!access.user)return fail("Forbidden",403);
 const parsed=wholeItemSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return fail(parsed.error.issues[0]?.message||"Invalid Code Mode JSON.",400);
 const d=parsed.data,s=createServiceClient();if(!s)return fail("Draft database unavailable",503);
 try{
  let id:string="",version:unknown=null;
  if(d.tool==="website"){
   if(d.id){
    const prior=await s.schema("content").from("items").select("id,source_system,editorial_status,updated_at,documents(body_json),publications(channel,status)").eq("id",d.id).maybeSingle();
    if(prior.error||!prior.data||prior.data.source_system!=="website"||prior.data.editorial_status!=="draft")throw new Error("Website item must be an existing draft.");
    const pub=prior.data.publications as unknown as Array<{channel:string;status:string}>||[];
    if(pub.some(p=>p.channel==="website"&&p.status==="published"))throw new Error("Code Mode cannot change a published website item.");
    matchDate(prior.data.updated_at,d.expectedUpdatedAt);
    await checkpoint(s,access.user.id,d.tool,d.id,prior.data);
    const r=await s.schema("content").rpc("update_editorial_item",{p_item_id:d.id,p_slug:d.slug,p_title:d.title,p_summary:d.summary,p_body:d.body,p_publish_website:false,p_actor_user_id:access.user.id});
    if(r.error)throw new Error(r.error.message);id=d.id;
   }else{
    const r=await s.schema("content").rpc("create_editorial_item",{p_kind:d.kind,p_slug:d.slug,p_title:d.title,p_summary:d.summary,p_body:d.body,p_publish_website:false,p_actor_user_id:access.user.id});
    if(r.error)throw new Error(r.error.message);id=String((r.data as {id?:unknown}).id);
   }
  } else if(d.tool==="content_engine"){
   const pack=await s.from("studio_editorial_packs").select("project_id,payload").eq("production_date",d.productionDate).maybeSingle();
   if(pack.error||!pack.data)throw new Error("Pack not found.");
   const project=await s.from("studio_creative_projects").select("status,state_version,format,editor_state").eq("id",pack.data.project_id).single();
   if(project.error||project.data.status!=="draft"||project.data.state_version!==d.expectedStateVersion)throw new Error("Linked project changed; reload before applying.");
   const normalized=normalizeEditorState(project.data.format,{...project.data.editor_state,frames:d.frames});
   if(normalized.frames.length!==d.frames.length)throw new Error("Invalid frame document.");
   await checkpoint(s,access.user.id,d.tool,d.productionDate,pack.data.payload);
   const res=await s.rpc("apply_code_editorial_pack",{p_date:d.productionDate,p_title:d.title,p_caption:d.caption,p_art_direction:d.artDirection,p_frames:normalized.frames,p_newsletter:d.newsletter,p_expected_version:d.expectedStateVersion,p_actor:access.user.id});
   if(res.error)throw new Error(res.error.message);id=d.productionDate;version=res.data;
  }else if(d.tool==="episode"){
   const isArticle=d.kind==="article",table=isArticle?"studio_episode_articles":"video_producer_episode_scripts";
   let q=s.from(table).select("*");q=isArticle?q.eq("episode_id",d.id):q.eq("id",d.id);
   const prior=await q.maybeSingle();
   if(prior.error||!prior.data||prior.data.status!=="draft")throw new Error("Episode is not an editable draft.");
   matchDate(prior.data.updated_at,d.expectedUpdatedAt);
   await checkpoint(s,access.user.id,d.tool,d.id,prior.data);
   const payload=isArticle?{title:d.title,body:d.body,slug:d.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,140),updated_by:access.user.id,updated_at:new Date().toISOString()}:
    {title:d.title,script_text:d.body,premise:d.premise||"",theology_review:null,approved_at:null,updated_by:access.user.id,updated_at:new Date().toISOString()};
   const res=await s.from(table).update(payload).eq(isArticle?"episode_id":"id",d.id).eq("status","draft").eq("updated_at",prior.data.updated_at).select("id").maybeSingle();
   if(res.error||!res.data)throw new Error("Episode changed during Apply.");id=d.id;
  }else if(d.tool==="audio"){
   if(!pathwayBySlug(d.pathwaySlug))throw new Error("Unknown Pathway.");
   const prior=await s.from("pathway_audio_scripts").select("*").eq("pathway_slug",d.pathwaySlug).eq("status","draft").maybeSingle();
   if(prior.error||!prior.data)throw new Error("Audio script is not a draft.");
   matchDate(prior.data.updated_at,d.expectedUpdatedAt);
   await checkpoint(s,access.user.id,d.tool,d.pathwaySlug,prior.data);
   const scriptHash=createHash("sha256").update(d.scriptText).digest("hex");
   const res=await s.from("pathway_audio_scripts").update({script_text:d.scriptText,script_hash:scriptHash,
    checker_status:null,checker_result:null,checked_script_hash:null,checked_at:null,updated_at:new Date().toISOString()}).eq("pathway_slug",d.pathwaySlug).eq("status","draft").eq("updated_at",prior.data.updated_at).select("pathway_slug").maybeSingle();
   if(res.error||!res.data)throw new Error("Audio script changed during Apply.");id=d.pathwaySlug;
  }else if(d.tool==="teleprompter"){
   if(d.id){
    const prior=await s.from("studio_teleprompter_code_drafts").select("*").eq("id",d.id).eq("owner_id",access.user.id).maybeSingle();
    if(prior.error||!prior.data)throw new Error("Private teleprompter draft not found.");
    matchDate(prior.data.updated_at,d.expectedUpdatedAt);
    await checkpoint(s,access.user.id,d.tool,d.id,prior.data);
    const res=await s.from("studio_teleprompter_code_drafts").update({title:d.title,script_text:d.scriptText,notes:d.notes,updated_at:new Date().toISOString()})
     .eq("id",d.id).eq("owner_id",access.user.id).eq("updated_at",prior.data.updated_at).select("id").maybeSingle();
    if(res.error||!res.data)throw new Error("Teleprompter draft changed.");id=d.id;
   }else{
    const res=await s.from("studio_teleprompter_code_drafts").insert({owner_id:access.user.id,title:d.title,script_text:d.scriptText,notes:d.notes}).select("id").single();
    if(res.error)throw new Error(res.error.message);id=res.data.id;
   }
  }else if(d.tool==="video"&&d.version===2){
   const producer=d.kind==="producer",table=producer?"video_producer_projects":"pathway_video_projects";
   const prior=await s.from(table).select("*").eq(producer?"id":"pathway_slug",d.id).maybeSingle();
   if(prior.error||!prior.data)throw new Error("Video project was not found.");
   if(producer&&["rendering","review","completed","ready","scheduled"].includes(prior.data.status))
     throw new Error("Ready, Scheduled and rendering projects are read-only. Duplicate or return the project to draft in Producer first.");
   matchDate(prior.data.updated_at,d.expectedUpdatedAt);
   if(!producer){
    const running=await s.from("pathway_video_renders").select("id").eq("pathway_slug",d.id).in("status",["queued","rendering"]).limit(1);
    if(running.error||running.data?.length)throw new Error("This Studio project is rendering and cannot be edited.");
   }
   const scenes=stripVideoSceneResolvedUrls(videoScenesSchema.parse(d));
   await checkpoint(s,access.user.id,d.tool,d.id,prior.data);
   const updatedAt=new Date().toISOString();
   const payload=producer?{
     director_metadata:{...(prior.data.director_metadata||{}),sceneProgram:{...scenes,expectedUpdatedAt:undefined}},
     status:"draft",approval_fingerprint:null,approved_at:null,updated_by:access.user.id,updated_at:updatedAt
   }:{
     style:{...(prior.data.style||{}),sceneProgram:{...scenes,expectedUpdatedAt:undefined}},
     updated_by:access.user.id,updated_at:updatedAt
   };
   const res=await s.from(table).update(payload).eq(producer?"id":"pathway_slug",d.id)
     .eq("updated_at",prior.data.updated_at).select("id").maybeSingle();
   if(res.error||!res.data)throw new Error("Video scenes changed during Apply. Reload the document.");
   id=d.id;
  }else{
   const producer=d.kind==="producer",table=producer?"video_producer_projects":"pathway_video_projects";
   const prior=await s.from(table).select("*").eq(producer?"id":"pathway_slug",d.id).maybeSingle();
   if(prior.error||!prior.data||(producer&&prior.data.status!=="draft"))throw new Error("Video project is not an editable draft.");
   matchDate(prior.data.updated_at,d.expectedUpdatedAt);
   if(!producer){
    const running=await s.from("pathway_video_renders").select("id").eq("pathway_slug",d.id).in("status",["queued","rendering"]).limit(1);
    if(running.error||running.data?.length)throw new Error("Cannot edit a video project while rendering.");
   }
   await checkpoint(s,access.user.id,d.tool,d.id,prior.data);
   const payload=producer?{title:d.title,director_metadata:d.directorMetadata,updated_by:access.user.id,updated_at:new Date().toISOString()}:
    {timeline:d.timeline,style:d.style,updated_by:access.user.id,updated_at:new Date().toISOString()};
   const res=await s.from(table).update(payload).eq(producer?"id":"pathway_slug",d.id).eq("updated_at",prior.data.updated_at).select("id").maybeSingle();
   if(res.error||!res.data)throw new Error("Video project changed during Apply.");id=d.id;
  }
  const audited=await recordStudioAudit({actorUserId:access.user.id,action:"code_mode."+d.tool+".applied",resourceType:d.tool,resourceId:z.string().uuid().safeParse(id).success?id:null,metadata:{sourceId:id,version,draftOnly:true}});
  if(!audited)throw new Error("Draft updated, but audit logging failed. Publishing remains outside Code Mode.");
  return NextResponse.json({ok:true,sourceId:id,version,notice:"Draft saved only. Approval, Ready, scheduling, sending, and publishing remain separate."});
 }catch(error){return fail(error);}
}

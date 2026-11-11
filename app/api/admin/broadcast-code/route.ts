import {NextResponse} from "next/server";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {emailCodeSchema} from "@/code-mode/broadcast";
import {getBroadcastCodeDraft} from "@/code-mode/broadcast-server";
import {recordStudioAudit} from "@/studio-audit";
export const runtime="nodejs";
const saveSchema=z.object({id:z.string().uuid().optional(),expectedVersion:z.number().int().min(1).optional(),document:emailCodeSchema});
const restoreSchema=z.object({id:z.string().uuid(),expectedVersion:z.number().int().min(1),revisionVersion:z.number().int().min(1)});
function denied(){return NextResponse.json({error:"Forbidden"},{status:403});}
export async function GET(request:Request){
 const {access,allowed}=await getStudioPermission("manage_distribution");if(!allowed||access.state!=="allowed"||!access.user)return denied();
 const id=new URL(request.url).searchParams.get("id");
 if(id&&!z.string().uuid().safeParse(id).success)return NextResponse.json({error:"Invalid draft ID."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Draft storage unavailable."},{status:503});
 if(!id){
  const result=await service.from("studio_broadcast_code_drafts").select("id,version,updated_at,document").eq("owner_id",access.user.id).eq("status","draft").order("updated_at",{ascending:false}).limit(30);
  if(result.error)return NextResponse.json({error:result.error.message},{status:503});
  return NextResponse.json({drafts:(result.data||[]).map(d=>({id:d.id,version:d.version,updated_at:d.updated_at,title:emailCodeSchema.safeParse(d.document).data?.campaign.title||"Untitled draft"}))});
 }
 try{
  const draft=await getBroadcastCodeDraft(service,id,access.user.id);
  const revisions=await service.from("studio_broadcast_code_revisions").select("version,created_at").eq("draft_id",id).order("version",{ascending:false}).limit(30);
  if(revisions.error)throw new Error(revisions.error.message);
  return NextResponse.json({draft,revisions:revisions.data||[]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to load draft."},{status:404});}
}
export async function POST(request:Request){
 const {access,allowed}=await getStudioPermission("manage_distribution");if(!allowed||access.state!=="allowed"||!access.user)return denied();
 const parsed=saveSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||"Invalid email JSON."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Draft storage unavailable."},{status:503});
 try{
  const {id,expectedVersion,document}=parsed.data;
  if(id){
   const previous=await getBroadcastCodeDraft(service,id,access.user.id);
   if(!expectedVersion||previous.version!==expectedVersion)return NextResponse.json({error:"Draft changed in another tab. Reload before applying."},{status:409});
   const checkpoint=await service.from("studio_broadcast_code_revisions").upsert({draft_id:id,version:previous.version,document:previous.document,actor_id:access.user.id},{onConflict:"draft_id,version"});
   if(checkpoint.error)throw new Error(checkpoint.error.message);
   const updated=await service.from("studio_broadcast_code_drafts").update({document,version:expectedVersion+1,resend_broadcast_id:null,last_created_hash:null,updated_at:new Date().toISOString()})
    .eq("id",id).eq("owner_id",access.user.id).eq("status","draft").eq("version",expectedVersion).select("*").maybeSingle();
   if(updated.error||!updated.data)return NextResponse.json({error:"Draft changed during Apply. Reload and try again."},{status:409});
   await recordStudioAudit({actorUserId:access.user.id,action:"code_mode.broadcast.applied",resourceType:"broadcast",resourceId:id,metadata:{version:updated.data.version}});
   return NextResponse.json({draft:updated.data});
  }
  const inserted=await service.from("studio_broadcast_code_drafts").insert({document,owner_id:access.user.id,status:"draft"}).select("*").single();
  if(inserted.error)throw new Error(inserted.error.message);
  await recordStudioAudit({actorUserId:access.user.id,action:"code_mode.broadcast.created",resourceType:"broadcast",resourceId:inserted.data.id,metadata:{version:1}});
  return NextResponse.json({draft:inserted.data});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Apply failed."},{status:409});}
}
export async function PATCH(request:Request){
 const {access,allowed}=await getStudioPermission("manage_distribution");if(!allowed||access.state!=="allowed"||!access.user)return denied();
 const parsed=restoreSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid restore."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Draft storage unavailable."},{status:503});
 try{
  const input=parsed.data,previous=await getBroadcastCodeDraft(service,input.id,access.user.id);
  if(input.expectedVersion!==previous.version)throw new Error("Draft changed in another tab.");
  const revision=await service.from("studio_broadcast_code_revisions").select("document").eq("draft_id",input.id).eq("version",input.revisionVersion).single();
  if(revision.error)throw new Error("Revision not found.");
  const document=emailCodeSchema.parse(revision.data.document);
  const checkpoint=await service.from("studio_broadcast_code_revisions").upsert({draft_id:input.id,version:previous.version,document:previous.document,actor_id:access.user.id},{onConflict:"draft_id,version"});
  if(checkpoint.error)throw new Error(checkpoint.error.message);
  const updated=await service.from("studio_broadcast_code_drafts").update({document,version:previous.version+1,last_created_hash:null,resend_broadcast_id:null,updated_at:new Date().toISOString()})
    .eq("id",input.id).eq("owner_id",access.user.id).eq("version",previous.version).select("*").single();
  if(updated.error)throw new Error("Concurrent revision. Reload and try again.");
  await recordStudioAudit({actorUserId:access.user.id,action:"code_mode.broadcast.restored",resourceType:"broadcast",resourceId:input.id,metadata:{from:input.revisionVersion,to:updated.data.version}});
  return NextResponse.json({draft:updated.data});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Restore failed."},{status:409});}
}

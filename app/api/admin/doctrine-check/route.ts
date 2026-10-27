import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { loadCreativeProject } from "@/creative-project-server";
import { textDoctrineSource, creativeDoctrineSource, currentDoctrineVerdict, recordDoctrineCheck, type DoctrineSource, type DoctrineSourceType } from "@/doctrine-gate";
import { recordStudioAudit } from "@/studio-audit";

export const runtime="nodejs";
export const maxDuration=120;
const sourceTypes=z.enum(["creative_project","threads","custom_asset","video_render","video_clip"]);
const schema=z.object({
 sourceType:sourceTypes, sourceId:z.string().uuid(), caption:z.string().max(10000).default(""),
 fields:z.record(z.string(),z.unknown()).optional().default({}), note:z.string().trim().max(2000).optional()
});
type Service=NonNullable<ReturnType<typeof createServiceClient>>;
const sourceTables:Record<Exclude<DoctrineSourceType,"creative_project">,string>={
 threads:"studio_threads_posts",custom_asset:"studio_pathway_assets",video_render:"pathway_video_renders",video_clip:"pathway_social_clips"
};
async function resolveSource(service:Service,data:z.infer<typeof schema>):Promise<DoctrineSource> {
 if(data.sourceType==="creative_project") {
  const project=await loadCreativeProject(service,data.sourceId);
  if(!project) throw new Error("Creative Project not found.");
  return creativeDoctrineSource(project,data.caption);
 }
 const table=sourceTables[data.sourceType];
 const found=await service.from(table).select("*").eq("id",data.sourceId).maybeSingle();
 if(found.error || !found.data) throw new Error("Publishing source not found.");
 if(data.sourceType==="threads") {
  const body=String(found.data.body || "");
  if(data.fields.body && data.fields.body!==body) throw new Error("Thread changed. Save and review the latest copy.");
  return textDoctrineSource("threads",data.sourceId,{body});
 }
 const fields:Record<string,unknown>={};
 for(const key of ["title","description","caption","alt_text","hashtags","transcript"]) {
  const value=data.fields[key];
  if(typeof value==="string") fields[key]=value;
 }
 if(data.sourceType==="custom_asset") {
  const meta=(found.data.metadata || {}) as Record<string,unknown>;
  if(!meta.customPublishing && !meta.mimeType && !meta.mime) throw new Error("Not a reviewable custom media asset.");
 }
 return textDoctrineSource(data.sourceType,data.sourceId,fields);
}
function errorResponse(error:unknown) {return NextResponse.json({error:error instanceof Error?error.message:"Doctrine review unavailable. Publishing is blocked."},{status:409});}
export async function GET(request:Request) {
 const {access,allowed}=await getStudioPermission("view_distribution");
 if(!allowed || access.state!=="allowed")return NextResponse.json({error:"Forbidden"},{status:403});
 const url=new URL(request.url);
 const raw={sourceType:url.searchParams.get("sourceType"),sourceId:url.searchParams.get("sourceId"),caption:url.searchParams.get("caption")||"",fields:{}};
 if(url.searchParams.has("fields")) {
  try {raw.fields=JSON.parse(url.searchParams.get("fields")||"{}");} catch {return NextResponse.json({error:"Invalid fields."},{status:400});}
 }
 const parsed=schema.safeParse(raw);
 if(!parsed.success)return NextResponse.json({error:"Invalid doctrine source."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Doctrine storage unavailable."},{status:503});
 try{const source=await resolveSource(service,parsed.data);return NextResponse.json(await currentDoctrineVerdict(service,source));}
 catch(error){return errorResponse(error);}
}
export async function POST(request:Request) {
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed || access.state!=="allowed"||!access.user)return NextResponse.json({error:"Forbidden"},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid doctrine check request."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Doctrine storage unavailable. Publishing is blocked."},{status:503});
 try {
  const source=await resolveSource(service,parsed.data);
  const checked=await recordDoctrineCheck(service,source,access.user.id);
  return NextResponse.json({...checked,state:checked.review.status});
 } catch(error) {return errorResponse(error);}
}
export async function PATCH(request:Request) {
 const {access}=await getStudioPermission("manage_distribution");
 if(access.state!=="allowed"||access.role!=="owner"||!access.user) return NextResponse.json({error:"Only the owner can approve a flagged doctrine result."},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success || !parsed.data.note || parsed.data.note.length<12)return NextResponse.json({error:"A meaningful approval note (at least 12 characters) is required."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Doctrine storage unavailable."},{status:503});
 try {
  const source=await resolveSource(service,parsed.data);
  const current=await currentDoctrineVerdict(service,source);
  if(current.state!=="flag" || !current.verdict) return NextResponse.json({error:"Only the latest matching FLAG can be approved. FAIL cannot be overridden."},{status:409});
  const audited=await recordStudioAudit({actorUserId:access.user.id,action:"doctrine.override",resourceType:source.sourceType,resourceId:source.sourceId,metadata:{
   hash:current.hash,model:current.verdict.model,status:"flagged_approved",note:parsed.data.note,verdictId:current.verdict.id
  }});
  if(!audited)throw new Error("Audit Log unavailable. Approval blocked.");
  const approvedAt=new Date().toISOString();
  const updated=await service.from("studio_doctrine_verdicts").update({override_note:parsed.data.note,override_by:access.user.id,approved_at:approvedAt})
   .eq("id",current.verdict.id).eq("status","flag").is("approved_at",null).select("id").maybeSingle();
  if(updated.error || !updated.data)throw new Error("Approval conflict. Run the doctrine check again.");
  if(source.sourceType==="creative_project") {
   const res=await service.from("studio_creative_projects").update({doctrine_status:"flagged_approved",doctrine_hash:current.hash}).eq("id",source.sourceId);
   if(res.error)throw new Error("Unable to attach owner approval: "+res.error.message);
  }
  return NextResponse.json({state:"flagged_approved",approvedAt});
 } catch(error){return errorResponse(error);}
}

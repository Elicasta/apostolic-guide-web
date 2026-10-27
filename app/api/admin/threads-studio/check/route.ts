import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { evaluateDoctrine, recordDoctrineCheck, textDoctrineSource } from "@/doctrine-gate";
import { recordStudioAudit } from "@/studio-audit";
export const runtime="nodejs";
export const maxDuration=120;
const requestSchema=z.object({batchId:z.string().uuid().optional(),posts:z.array(z.object({id:z.string().uuid().optional(),body:z.string().min(1).max(1000),category:z.string().max(40)})).min(1).max(30)});
export async function POST(request:Request) {
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed||access.state!=="allowed"||!access.user)return NextResponse.json({error:"Forbidden"},{status:403});
 const parsed=requestSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid Threads review request."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Doctrine storage unavailable."},{status:503});
 const posts=[];
 try {
  for(let index=0;index<parsed.data.posts.length;index++) {
   const item=parsed.data.posts[index],id=item.id||randomUUID();
   if(item.id) {
    const saved=await service.from("studio_threads_posts").select("body").eq("id",item.id).maybeSingle();
    if(saved.error||!saved.data||saved.data.body!==item.body)throw new Error("Save the Thread before checking its current text.");
   }
   const source=textDoctrineSource("threads",id,{body:item.body});
   const checked=item.id?await recordDoctrineCheck(service,source,access.user.id):await evaluateDoctrine(source);
   if(!item.id){
    const logged=await recordStudioAudit({actorUserId:access.user.id,action:"doctrine.checked",resourceType:"threads",resourceId:id,metadata:{hash:checked.hash,model:checked.model,status:checked.review.status,issues:checked.review.issues,unsavedDraft:true}});
    if(!logged)throw new Error("Doctrine audit unavailable.");
   }
   const status=checked.review.status==="pass"?"pass":checked.review.status==="flag"?"warning":"blocked";
   posts.push({index,status,notes:checked.review.issues.map(v=>v.location+": "+v.reason).join(" | ").slice(0,500)||checked.review.summary,suggestion:status==="pass"?"":"Revise and re-check or request a flagged owner approval."});
   if(item.id) {
    const updated=await service.from("studio_threads_posts").update({doctrine_status:status,doctrine_notes:posts[index].notes}).eq("id",item.id);
    if(updated.error)throw new Error(updated.error.message);
   }
  }
  const status=posts.some(p=>p.status==="blocked")?"blocked":posts.some(p=>p.status==="warning")?"warning":"pass";
  const summary=status==="pass"?"All posts passed the required doctrine review.":status==="warning"?"One or more posts need owner approval.":"One or more posts failed doctrine review.";
  if(parsed.data.batchId)await service.from("studio_threads_batches").update({doctrine_status:status,doctrine_summary:summary,status:status==="blocked"?"draft":"reviewed",updated_at:new Date().toISOString()}).eq("id",parsed.data.batchId);
  return NextResponse.json({review:{status,summary,posts},model:"gpt-5.6-sol"});
 } catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Doctrine validator unavailable. Publishing blocked."},{status:503});}
}

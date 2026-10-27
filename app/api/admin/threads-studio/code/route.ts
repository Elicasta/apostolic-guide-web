import {NextResponse} from "next/server";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {threadsCodeSchema} from "@/code-mode/threads";
import {recordDoctrineCheck,textDoctrineSource} from "@/doctrine-gate";
import {recordStudioAudit} from "@/studio-audit";
export const runtime="nodejs";export const maxDuration=300;
export async function POST(request:Request){
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed||access.state!=="allowed"||!access.user)return NextResponse.json({error:"Forbidden"},{status:403});
 const parsed=threadsCodeSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||"Invalid Threads JSON."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Draft storage unavailable."},{status:503});
 const applied=await service.rpc("apply_studio_threads_code",{p_document:parsed.data});
 if(applied.error)return NextResponse.json({error:applied.error.message},{status:409});
 const result=applied.data as {batchId:string;posts:Array<{id:string;body:string;category:string;position:number}>};
 const reviewed=await Promise.all(result.posts.map(async post=>{
  try{
   const verdict=await recordDoctrineCheck(service,textDoctrineSource("threads",post.id,{body:post.body}),access.user.id);
   const status=verdict.review.status==="pass"?"pass":verdict.review.status==="flag"?"warning":"blocked";
   await service.from("studio_threads_posts").update({doctrine_status:status,doctrine_notes:verdict.review.summary}).eq("id",post.id).eq("status","draft");
   return {id:post.id,doctrineStatus:status,issues:verdict.review.issues};
  }catch(error){
   await service.from("studio_threads_posts").update({doctrine_status:null,doctrine_notes:"Doctrine unavailable: review required."}).eq("id",post.id).eq("status","draft");
   return {id:post.id,doctrineStatus:"not_checked",issues:[],error:error instanceof Error?error.message:"Doctrine check unavailable."};
  }
 }));
 const audited=await recordStudioAudit({actorUserId:access.user.id,action:"code_mode.threads.applied",resourceType:"threads_batch",resourceId:result.batchId,metadata:{count:result.posts.length,doctrineStates:reviewed.map(p=>p.doctrineStatus)}});
 if(!audited)return NextResponse.json({error:"Audit log unavailable. Drafts were saved but cannot leave Studio."},{status:503});
 return NextResponse.json({ok:true,batchId:result.batchId,posts:result.posts,reviewed,allPassed:reviewed.every(v=>v.doctrineStatus==="pass")});
}

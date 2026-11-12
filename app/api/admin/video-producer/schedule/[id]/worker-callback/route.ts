import {NextResponse} from "next/server";
import {z} from "zod";
import {createServiceClient} from "@/supabase";
import {workerTokenMatches} from "@/video-producer-server";
export const runtime="nodejs";
const id=z.string().uuid();
const schema=z.object({
 token:z.string().min(32).max(160),
 status:z.enum(["uploading","accepted","completed","failed"]),
 progress:z.number().int().min(0).max(100).optional(),
 stage:z.string().max(180).optional(),
 videoId:z.string().regex(/^[A-Za-z0-9_-]{8,20}$/).optional(),
 error:z.string().max(1800).optional(),
 warnings:z.array(z.string().max(800)).max(8).optional()
}).strict();
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const {id:jobId}=await context.params;
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!id.safeParse(jobId).success||!parsed.success)return NextResponse.json({error:"Invalid worker callback"},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Unavailable"},{status:503});
 const r=await service.from("video_producer_schedule_drafts")
  .select("id,status,youtube_video_id,worker_callback_token_hash,worker_token_expires_at")
  .eq("id",jobId).maybeSingle();
 if(r.error)return NextResponse.json({error:"Unavailable"},{status:503});
 const job=r.data,body=parsed.data;
 if(!job||!["submitting","submitted"].includes(job.status)||!job.worker_callback_token_hash||
  !job.worker_token_expires_at||new Date(job.worker_token_expires_at)<new Date()||
  !workerTokenMatches(body.token,job.worker_callback_token_hash))
  return NextResponse.json({error:"Invalid, completed or expired worker callback"},{status:403});
 if(job.status==="submitted"&&body.status==="accepted"&&job.youtube_video_id===body.videoId)
  return NextResponse.json({ok:true,idempotent:true});
 if(job.status==="submitted"&&body.status!=="completed")
  return NextResponse.json({error:"Video was already accepted. Do not repeat upload."},{status:409});
 const changes:Record<string,unknown>={worker_heartbeat_at:new Date().toISOString(),
  worker_progress:body.progress??0,worker_stage:body.stage||body.status};
 if(body.status==="accepted"){
  if(job.status!=="submitting"||!body.videoId)return NextResponse.json({error:"YouTube video ID required"},{status:400});
  changes.status="submitted";changes.youtube_video_id=body.videoId;
  changes.submitted_at=new Date().toISOString();changes.worker_progress=100;
 }else if(body.status==="completed"){
  if(job.status!=="submitted"||!job.youtube_video_id)return NextResponse.json({error:"Video must first be accepted by YouTube"},{status:409});
  changes.worker_progress=100;
  changes.error_message=body.warnings?.length?body.warnings.join(" ").slice(0,1800):null;
  changes.worker_stage="YouTube accepted video and metadata";
 }else if(body.status==="failed"){
  if(job.status!=="submitting")return NextResponse.json({error:"Published schedule cannot be failed"},{status:409});
  changes.status="failed";
  changes.error_message=(body.error||"YouTube upload failed. Check YouTube Studio before any retry.").slice(0,1800);
 }
 const update=await service.from("video_producer_schedule_drafts").update(changes).eq("id",job.id).eq("status",job.status);
 if(update.error)return NextResponse.json({error:"Unable to record worker state"},{status:503});
 return NextResponse.json({ok:true});
}

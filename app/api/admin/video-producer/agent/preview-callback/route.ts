import {NextResponse} from "next/server";
import {z} from "zod";
import {createServiceClient} from "@/supabase";
import {workerTokenMatches} from "@/video-producer-server";
export const runtime="nodejs";

const schema=z.object({
 jobId:z.string().uuid(),
 token:z.string().min(20).max(150),
 status:z.enum(["rendering","completed","failed"]),
 error:z.string().max(1500).optional()
}).strict();

export async function POST(request:Request){
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid preview callback"},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Unavailable"},{status:503});
 const existing=await service.from("video_producer_agent_previews").select("id,status,callback_token_hash,expires_at")
  .eq("id",parsed.data.jobId).maybeSingle();
 if(existing.error)return NextResponse.json({error:"Unavailable"},{status:503});
 const job=existing.data;
 if(!job||!["queued","rendering"].includes(job.status)||new Date(job.expires_at)<=new Date()
  ||!workerTokenMatches(parsed.data.token,job.callback_token_hash))
  return NextResponse.json({error:"Invalid or expired worker callback"},{status:403});
 const update=await service.from("video_producer_agent_previews").update({
  status:parsed.data.status,
  error:parsed.data.status==="failed"?(parsed.data.error||"Draft proof renderer failed"):null,
  completed_at:parsed.data.status==="rendering"?null:new Date().toISOString()
 }).eq("id",job.id).in("status",["queued","rendering"]);
 if(update.error)return NextResponse.json({error:"Unable to update preview"},{status:503});
 return NextResponse.json({ok:true});
}

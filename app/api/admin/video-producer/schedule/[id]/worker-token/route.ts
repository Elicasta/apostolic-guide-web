import {NextResponse} from "next/server";
import {z} from "zod";
import {createServiceClient} from "@/supabase";
import {workerTokenMatches} from "@/video-producer-server";
import {getVideoProducerBrand} from "@/video-producer-brand-server";
import {validateVideoProducerChannel} from "@/video-producer-brand-profiles";
import {videoProducerYouTubeAccessToken,verifyVideoProducerYouTubeChannel} from "@/video-producer-youtube-schedule-server";
export const runtime="nodejs";
const id=z.string().uuid();
const payload=z.object({token:z.string().min(32).max(160)}).strict();
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const {id:jobId}=await context.params;
 const parsed=payload.safeParse(await request.json().catch(()=>null));
 if(!id.safeParse(jobId).success||!parsed.success)return NextResponse.json({error:"Invalid worker request"},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Unavailable"},{status:503});
 const r=await service.from("video_producer_schedule_drafts")
  .select("status,brand_slug,channel_handle,worker_callback_token_hash,worker_token_expires_at")
  .eq("id",jobId).maybeSingle();
 if(r.error)return NextResponse.json({error:"Unavailable"},{status:503});
 const job=r.data;
 if(!job||!["submitting","submitted"].includes(job.status)||!job.worker_callback_token_hash||
   !job.worker_token_expires_at||new Date(job.worker_token_expires_at)<new Date()||
   !workerTokenMatches(parsed.data.token,job.worker_callback_token_hash))
  return NextResponse.json({error:"Invalid or expired schedule worker token"},{status:403});
 try{
  const profile=await getVideoProducerBrand(service,job.brand_slug);
  if(profile.config.destination.type!=="youtube"||!validateVideoProducerChannel(profile,job.channel_handle))
   return NextResponse.json({error:"Schedule destination is no longer allowed"},{status:403});
  const token=await videoProducerYouTubeAccessToken();
  const verified=await verifyVideoProducerYouTubeChannel(token,job.channel_handle);
  return NextResponse.json({accessToken:token,channelId:verified.id,channelHandle:job.channel_handle,expiresInSeconds:2700});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"YouTube channel cannot be verified"},{status:409});}
}

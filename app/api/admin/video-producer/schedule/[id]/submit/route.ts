import {NextResponse} from "next/server";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {getVideoProducerBrand} from "@/video-producer-brand-server";
import {validateVideoProducerChannel} from "@/video-producer-brand-profiles";
import {validateFutureVideoProducerSchedule} from "@/video-producer-schedule";
import {
 createPrivateBlobDownloadUrl,createWorkerCallbackToken,
 dispatchVideoProducerWorker,videoProducerRendererCredentials,videoProducerWorkerRef
} from "@/video-producer-server";
import {videoProducerYouTubeAccessToken,verifyVideoProducerYouTubeChannel} from "@/video-producer-youtube-schedule-server";

export const runtime="nodejs";
export const maxDuration=60;
const uuid=z.string().uuid();
const schema=z.object({confirm:z.literal(true)}).strict();
const WORKER_TTL_MS=5*60*60*1000;
function fail(error:string,status=409){return NextResponse.json({error},{status});}

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 // No cron, draft machine token, or model can enter this route. Only an
 // authenticated human with manage_distribution confirms an approved master.
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed||access.state!=="allowed"||!access.user)return fail("Forbidden",403);
 const {id}=await context.params;
 if(!uuid.safeParse(id).success)return fail("Invalid calendar item.",400);
 if(!schema.safeParse(await request.json().catch(()=>null)).success)
  return fail("Press the confirmation button before sending this video.",400);
 const service=createServiceClient();if(!service)return fail("Database unavailable",503);
 const fetched=await service.from("video_producer_schedule_drafts")
  .select("id,project_id,brand_slug,channel_handle,publish_at,title,description,playlist_id,thumbnail_variant,custom_thumbnail_path,status,youtube_video_id")
  .eq("id",id).maybeSingle();
 if(fetched.error)return fail(fetched.error.message,500);
 const item=fetched.data;
 if(!item)return fail("Calendar item not found.",404);
 if(item.youtube_video_id||item.status==="submitted")return fail("YouTube already received this video. Do not upload it twice.",409);
 if(item.status!=="draft")return fail("This item is already submitting or needs manual review. Check YouTube Studio before trying again.",409);
 try{validateFutureVideoProducerSchedule(new Date(item.publish_at));}
 catch(e){return fail(e instanceof Error?e.message:"Publish time is invalid.",409);}
 let brand;
 try{brand=await getVideoProducerBrand(service,item.brand_slug);}
 catch(e){return fail(e instanceof Error?e.message:"Brand unavailable.",409);}
 if(brand.config.destination.type!=="youtube"||!validateVideoProducerChannel(brand,item.channel_handle))
  return fail("This brand cannot schedule to the selected channel.",403);
 const project=await service.from("video_producer_projects")
  .select("id,title,mode,status,brand_profile,approval_fingerprint")
  .eq("id",item.project_id).is("deleted_at",null).maybeSingle();
 if(project.error)return fail(project.error.message,500);
 if(!project.data||project.data.brand_profile!==brand.slug)
  return fail("Calendar project no longer matches its brand.",409);
 if(!project.data.approval_fingerprint||!["review","completed"].includes(project.data.status))
  return fail("Approve and finish the master before scheduling.",409);
 const latest=await service.from("video_producer_renders")
  .select("id,status,output_storage_path,config_snapshot")
  .eq("project_id",project.data.id).eq("status","completed").order("completed_at",{ascending:false}).limit(1).maybeSingle();
 if(latest.error)return fail(latest.error.message,500);
 if(!latest.data?.output_storage_path)return fail("Completed review master was not found.",409);
 const snapshot=latest.data.config_snapshot as Record<string,unknown>|null;
 if(snapshot?.approvalFingerprint!==project.data.approval_fingerprint)
  return fail("Completed master does not match the human approved edit. Render and review again.",409);

 let thumbnailPath=item.custom_thumbnail_path||null;
 if(!thumbnailPath&&item.thumbnail_variant){
  const thumb=await service.from("video_producer_thumbnails")
   .select("storage_locator,status").eq("project_id",project.data.id)
   .eq("variant",item.thumbnail_variant).eq("status","completed").maybeSingle();
  if(thumb.error)return fail(thumb.error.message,500);
  if(!thumb.data?.storage_locator)return fail("Selected thumbnail A or B is not ready. Generate it or choose a custom thumbnail.",409);
  thumbnailPath=thumb.data.storage_locator;
 }
 let token="",repository="",sourceUrl="",thumbnailUrl:string|null=null;
 try{
  // Verify the exact owned channel before claiming the single-upload lock.
  const youtubeToken=await videoProducerYouTubeAccessToken();
  await verifyVideoProducerYouTubeChannel(youtubeToken,item.channel_handle);
  ({token,repository}=await videoProducerRendererCredentials(service));
  if(!token)throw new Error("VIDEO_STUDIO_GITHUB_TOKEN is not configured. Check the worker health panel.");
  [sourceUrl,thumbnailUrl]=await Promise.all([
   createPrivateBlobDownloadUrl(latest.data.output_storage_path,WORKER_TTL_MS),
   thumbnailPath?createPrivateBlobDownloadUrl(thumbnailPath,WORKER_TTL_MS):Promise.resolve(null)
  ]);
 }catch(e){return fail(e instanceof Error?e.message:"Worker or YouTube channel is unavailable.",409);}
 const callback=createWorkerCallbackToken();
 const expiresAt=new Date(Date.now()+WORKER_TTL_MS).toISOString();
 const claimed=await service.from("video_producer_schedule_drafts").update({
  status:"submitting",error_message:null,worker_callback_token_hash:callback.hash,
  worker_token_expires_at:expiresAt,worker_heartbeat_at:new Date().toISOString(),
  worker_progress:0,worker_stage:"Queued for human requested GitHub upload"
 }).eq("id",id).eq("status","draft").is("youtube_video_id",null).select("id").maybeSingle();
 if(claimed.error)return fail(claimed.error.message,500);
 if(!claimed.data)return fail("Another request already claimed this upload.",409);
 try{
  const origin=new URL(request.url).origin;
  await dispatchVideoProducerWorker({
   token,repository,eventType:"video-producer-youtube-schedule",
   payload:{
    job_id:id,project_id:project.data.id,worker_ref:videoProducerWorkerRef(),
    source_url:sourceUrl,thumbnail_url:thumbnailUrl,
    title:(item.title||project.data.title).slice(0,100),description:item.description||"",
    publish_at:new Date(item.publish_at).toISOString(),channel_handle:item.channel_handle,
    playlist_id:item.playlist_id||null,
    callback_url:new URL(`/api/admin/video-producer/schedule/${id}/worker-callback`,origin).toString(),
    token_url:new URL(`/api/admin/video-producer/schedule/${id}/worker-token`,origin).toString(),
    callback_token:callback.token
   }
  });
  return NextResponse.json({
   ok:true,status:"submitting",jobId:id,channelHandle:item.channel_handle,
   publishAt:item.publish_at,message:"Human confirmed. A private worker is uploading the approved master; the scheduled YouTube video ID will appear in this calendar when accepted."
  },{status:202});
 }catch(e){
  // GitHub dispatch response may be ambiguous, so never reset to draft and
  // risk a duplicate upload. A human must inspect Actions/Studio first.
  const error=e instanceof Error?e.message:"GitHub worker dispatch failed.";
  await service.from("video_producer_schedule_drafts").update({
   status:"failed",error_message:error.slice(0,1800),
   worker_callback_token_hash:null,worker_stage:"Dispatch failed"
  }).eq("id",id).eq("status","submitting")
   .eq("worker_callback_token_hash",callback.hash);
  return fail(error+" Inspect GitHub Actions before attempting another upload.",502);
 }
}

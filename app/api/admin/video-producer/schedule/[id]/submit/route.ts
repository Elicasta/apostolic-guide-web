import {NextResponse} from "next/server";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {createPrivateBlobDownloadUrl,createWorkerCallbackToken,dispatchVideoProducerWorker,videoProducerRendererCredentials,videoProducerWorkerRef} from "@/video-producer-server";
import {getVideoProducerBrand} from "@/video-producer-brand-server";
import {validateVideoProducerChannel} from "@/video-producer-brand-profiles";
import {validateFutureVideoProducerSchedule} from "@/video-producer-schedule";
import {videoProducerYouTubeAccessToken,verifyVideoProducerYouTubeChannel} from "@/video-producer-youtube-schedule-server";

export const runtime="nodejs";
export const maxDuration=60;
const idSchema=z.string().uuid();
const submitSchema=z.object({confirm:z.literal(true)}).strict();
function err(message:string,status=409){return NextResponse.json({error:message},{status});}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 // A real signed-in admin must press the publish/schedule button. Agent tokens
 // have no access to this route and there is no cron that calls it.
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed||access.state!=="allowed"||!access.user)return err("Forbidden",403);
 const {id}=await context.params;
 if(!idSchema.safeParse(id).success)return err("Invalid schedule ID.",400);
 const confirmed=submitSchema.safeParse(await request.json().catch(()=>null));
 if(!confirmed.success)return err("Press the confirmation button to send this video to YouTube.",400);
 const service=createServiceClient();if(!service)return err("Database unavailable",503);
 const record=await service.from("video_producer_schedule_drafts")
  .select("id,project_id,brand_slug,channel_handle,publish_at,title,description,playlist_id,thumbnail_variant,custom_thumbnail_path,status,youtube_video_id")
  .eq("id",id).maybeSingle();
 if(record.error)return err(record.error.message,500);
 const draft=record.data;
 if(!draft)return err("Calendar item not found.",404);
 if(draft.status==="submitted")return err("This video was already submitted to YouTube. It will not be uploaded again.",409);
 if(draft.status!=="draft")return err("This item is already submitting or needs manual review in YouTube Studio before a retry.",409);
 try{validateFutureVideoProducerSchedule(new Date(draft.publish_at));}
 catch(e){return err(e instanceof Error?e.message:"Publish time is not in the future.",409);}
 let profile;
 try{profile=await getVideoProducerBrand(service,draft.brand_slug);}
 catch(e){return err(e instanceof Error?e.message:"Brand profile unavailable",409);}
 if(profile.config.destination.type!=="youtube"||!validateVideoProducerChannel(profile,draft.channel_handle))
  return err("Channel mismatch. This brand cannot publish to the selected destination.",403);
 const project=await service.from("video_producer_projects")
  .select("id,title,brand_profile,mode,status,approval_fingerprint")
  .eq("id",draft.project_id).is("deleted_at",null).maybeSingle();
 if(project.error)return err(project.error.message,500);
 if(!project.data||project.data.brand_profile!==profile.slug||!["podcast","reels"].includes(project.data.mode))
  return err("The project no longer belongs to this brand.",409);
 if(!project.data.approval_fingerprint||!["review","completed"].includes(project.data.status))
  return err("Review the approved finished video before submitting it to YouTube.",409);
 const render=await service.from("video_producer_renders")
  .select("id,status,output_storage_path,config_snapshot")
  .eq("project_id",project.data.id).eq("status","completed").order("completed_at",{ascending:false}).limit(1).maybeSingle();
 if(render.error)return err(render.error.message,500);
 if(!render.data?.output_storage_path)return err("No completed private review master is available.",409);
 const snapshot=render.data.config_snapshot as Record<string,unknown>|null;
 if(snapshot?.approvalFingerprint!==project.data.approval_fingerprint)return err("The completed master no longer matches the approved edit fingerprint.",409);
 let token:string;
 try{
  token=await videoProducerYouTubeAccessToken();
  await verifyVideoProducerYouTubeChannel(token,draft.channel_handle);
 }catch(e){return err(e instanceof Error?e.message:"The selected YouTube channel is not authorized.",409);}

 // Claim before dispatch. A second click must not upload or schedule again.
 const callback=createWorkerCallbackToken();
 const expiresAt=new Date(Date.now()+8*60*60*1000).toISOString();
 const claimed=await service.from("video_producer_schedule_drafts").update({
  status:"submitting",error_message:null,
  worker_callback_token_hash:callback.hash,worker_token_expires_at:expiresAt,
  worker_heartbeat_at:new Date().toISOString(),worker_stage:"Waiting for GitHub Actions",
  worker_progress:0
 }).eq("id",id).eq("status","draft").is("youtube_video_id",null)
  .select("id").maybeSingle();
 if(claimed.error)return err(claimed.error.message,500);
 if(!claimed.data)return err("Another request already started this YouTube submission.",409);
 try{
  const {token:githubToken,repository}=await videoProducerRendererCredentials(service);
  if(!githubToken)throw new Error("GitHub dispatcher token VIDEO_STUDIO_GITHUB_TOKEN is not configured.");
  const ttl=8*60*60*1000;
  const sourceUrl=await createPrivateBlobDownloadUrl(render.data.output_storage_path,ttl);
  let thumbnailPath=draft.custom_thumbnail_path;
  if(!thumbnailPath&&draft.thumbnail_variant){
   const selected=await service.from("video_producer_thumbnails").select("storage_locator,status")
    .eq("project_id",project.data.id).eq("variant",draft.thumbnail_variant).maybeSingle();
   if(selected.error)throw new Error(selected.error.message);
   if(selected.data?.status!=="completed"||!selected.data.storage_locator)
    throw new Error("Selected YouTube thumbnail A or B is not ready. Review thumbnails first.");
   thumbnailPath=selected.data.storage_locator;
  }
  const thumbUrl=thumbnailPath?await createPrivateBlobDownloadUrl(thumbnailPath,ttl):null;
  const workerRef=videoProducerWorkerRef();
  await dispatchVideoProducerWorker({
   token:githubToken,repository,eventType:"video-producer-youtube-schedule",
   payload:{
    job_id:id,project_id:project.data.id,worker_ref:workerRef,
    channel_handle:draft.channel_handle,
    source_url:sourceUrl,thumbnail_url:thumbUrl,
    callback_url:new URL("/api/admin/video-producer/schedule/"+id+"/worker-callback",request.url).toString(),
    token_url:new URL("/api/admin/video-producer/schedule/"+id+"/worker-token",request.url).toString(),
    callback_token:callback.token,
    title:draft.title||project.data.title,description:draft.description||"",
    publish_at:new Date(draft.publish_at).toISOString(),
    playlist_id:draft.playlist_id||null
   }
  });
  return NextResponse.json({
   ok:true,status:"submitting",jobId:id,publishAt:draft.publish_at,
   message:"Upload queued in GitHub Actions after your explicit confirmation. YouTube will receive this video privately with the requested future publish time.",
   humanConfirmed:true
  },{status:202});
 }catch(error){
  const reason=error instanceof Error?error.message:"GitHub upload worker could not be started.";
  await service.from("video_producer_schedule_drafts").update({
   status:"failed",error_message:reason.slice(0,1800),
   worker_stage:"GitHub dispatch failed",worker_callback_token_hash:null,
   worker_token_expires_at:null
  }).eq("id",id).eq("status","submitting");
  return err(reason+" No automatic retry was scheduled. Recheck the health panel and confirm YouTube Studio state before a new attempt.",502);
 }
}

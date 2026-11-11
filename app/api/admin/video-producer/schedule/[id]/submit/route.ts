import {NextResponse} from "next/server";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {createPrivateBlobDownloadUrl} from "@/video-producer-server";
import {getVideoProducerBrand} from "@/video-producer-brand-server";
import {validateVideoProducerChannel} from "@/video-producer-brand-profiles";
import {validateFutureVideoProducerSchedule} from "@/video-producer-schedule";
import {
 videoProducerYouTubeAccessToken,verifyVideoProducerYouTubeChannel,
 uploadScheduledVideoToYouTube,attachYouTubeVideoThumbnail,addVideoProducerYouTubePlaylist
} from "@/video-producer-youtube-schedule-server";

export const runtime="nodejs";
export const maxDuration=300;
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
 const claimed=await service.from("video_producer_schedule_drafts")
  .update({status:"submitting",error_message:null})
  .eq("id",id).eq("status","draft").is("youtube_video_id",null).select("id").maybeSingle();
 if(claimed.error)return err(claimed.error.message,500);
 if(!claimed.data)return err("Another request already started submitting this item.",409);
 let videoId:string|null=null;
 try{
  const privateUrl=await createPrivateBlobDownloadUrl(render.data.output_storage_path,4*60*60*1000);
  videoId=await uploadScheduledVideoToYouTube({
   token,sourceUrl:privateUrl,title:draft.title||project.data.title,description:draft.description||"",publishAt:new Date(draft.publish_at).toISOString()
  });
  // Store the YouTube ID immediately so a thumbnail/playlist error cannot cause
  // a second video upload on retry.
  const stored=await service.from("video_producer_schedule_drafts").update({
   status:"submitted",youtube_video_id:videoId,submitted_at:new Date().toISOString()
  }).eq("id",id).eq("status","submitting");
  if(stored.error)throw new Error("YouTube accepted the video but saving its ID failed. Do not retry the upload. Verify video "+videoId+" in YouTube Studio. "+stored.error.message);
 }catch(e){
  const msg=e instanceof Error?e.message:"YouTube scheduling failed.";
  await service.from("video_producer_schedule_drafts").update({status:"failed",error_message:msg.slice(0,1800),youtube_video_id:videoId}).eq("id",id).eq("status","submitting");
  return err(msg+" Check YouTube Studio before attempting any resubmission.",502);
 }
 const warnings:string[]=[];
 let thumbnailPath=draft.custom_thumbnail_path;
 if(!thumbnailPath&&draft.thumbnail_variant){
  const selected=await service.from("video_producer_thumbnails").select("storage_locator,status")
   .eq("project_id",project.data.id).eq("variant",draft.thumbnail_variant).maybeSingle();
  if(selected.error)warnings.push("Thumbnail lookup failed: "+selected.error.message);
  else if(selected.data?.status==="completed"&&selected.data.storage_locator)thumbnailPath=selected.data.storage_locator;
  else warnings.push("Selected thumbnail A or B is not ready. Choose a completed image in YouTube Studio.");
 }
 if(thumbnailPath){
  try{await attachYouTubeVideoThumbnail(token,videoId!,await createPrivateBlobDownloadUrl(thumbnailPath,30*60*1000));}
  catch(e){warnings.push(e instanceof Error?e.message:"Thumbnail upload failed. You can upload it manually in YouTube Studio.");}
 }
 if(draft.playlist_id){
  try{await addVideoProducerYouTubePlaylist(token,videoId!,draft.playlist_id);}
  catch(e){warnings.push(e instanceof Error?e.message:"Could not add the video to the playlist.");}
 }
 if(warnings.length)await service.from("video_producer_schedule_drafts").update({error_message:warnings.join(" ").slice(0,1800)}).eq("id",id);
 return NextResponse.json({ok:true,status:"submitted",videoId,
  youtubeUrl:"https://www.youtube.com/watch?v="+encodeURIComponent(videoId!),
  publishAt:draft.publish_at,warnings,
  message:"YouTube accepted this private video with a future publish time. It was submitted only after your confirmation."});
}

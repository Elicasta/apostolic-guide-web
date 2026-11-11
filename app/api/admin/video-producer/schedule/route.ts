import {NextResponse} from "next/server";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {getVideoProducerBrand} from "@/video-producer-brand-server";
import {validateVideoProducerChannel} from "@/video-producer-brand-profiles";
import {
 alternateVideoProducerCalendar,calendarDayOffset,defaultVideoProducerSchedule,
 parseVideoProducerLocalDateTime,validateFutureVideoProducerSchedule
} from "@/video-producer-schedule";

export const runtime="nodejs";
const createSchema=z.object({
 brandSlug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
 channelHandle:z.string().min(2).max(100),
 projectIds:z.array(z.string().uuid()).min(1).max(45),
 localDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
 localTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("18:00"),
 playlistId:z.string().max(120).optional(),
 thumbnailVariant:z.enum(["A","B"]).optional()
}).strict();
const patchSchema=z.object({
 id:z.string().uuid(),localDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 localTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
 title:z.string().trim().min(1).max(100),
 description:z.string().max(5000),
 thumbnailVariant:z.enum(["A","B"]).nullable().optional(),
 playlistId:z.string().max(120).nullable().optional()
}).strict();
function respond(error:string,status=409){return NextResponse.json({error},{status});}
export async function GET(request:Request){
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed||access.state!=="allowed")return respond("Forbidden",403);
 const s=createServiceClient();if(!s)return respond("Database unavailable",503);
 const slug=new URL(request.url).searchParams.get("brand")||"in-the-now";
 try{
  const brand=await getVideoProducerBrand(s,slug);
  if(brand.config.destination.type!=="youtube")return respond("This profile uses the Apostolic Guide Publisher, not direct YouTube scheduling.",409);
  const [queue,projects]=await Promise.all([
   s.from("video_producer_schedule_drafts").select("id,project_id,brand_slug,channel_handle,publish_at,local_date,local_time,title,description,playlist_id,thumbnail_variant,status,youtube_video_id,error_message,submitted_at").eq("brand_slug",brand.slug).order("publish_at",{ascending:true}).limit(150),
   s.from("video_producer_projects").select("id,title,mode,status,brand_profile,source_locator").eq("brand_profile",brand.slug).is("deleted_at",null).order("created_at",{ascending:false}).limit(150)
  ]);
  if(queue.error)return respond(queue.error.message,500);
  if(projects.error)return respond(projects.error.message,500);
  return NextResponse.json({brand,defaultSlot:defaultVideoProducerSchedule(),drafts:queue.data||[],
   projects:(projects.data||[]).map(({source_locator,...p})=>({...p,hasSource:Boolean(source_locator)}))});
 }catch(e){return respond(e instanceof Error?e.message:"Scheduling unavailable",409);}
}
export async function POST(request:Request){
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed||access.state!=="allowed"||!access.user)return respond("Forbidden",403);
 const parsed=createSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return respond(parsed.error.issues[0]?.message||"Invalid calendar draft",400);
 const s=createServiceClient();if(!s)return respond("Database unavailable",503);
 const data=parsed.data;
 try{
  const brand=await getVideoProducerBrand(s,data.brandSlug);
  if(brand.config.destination.type!=="youtube"||!validateVideoProducerChannel(brand,data.channelHandle))
   return respond("This brand cannot schedule to the selected YouTube channel.",403);
  if(new Set(data.projectIds).size!==data.projectIds.length)return respond("A project appears more than once.",400);
  const projects=await s.from("video_producer_projects").select("id,title,mode,status,brand_profile")
   .in("id",data.projectIds).is("deleted_at",null);
  if(projects.error)return respond(projects.error.message,500);
  const projectRows=projects.data||[];
  if(projectRows.length!==data.projectIds.length||projectRows.some(p=>p.brand_profile!==brand.slug||!["podcast","reels"].includes(p.mode)))
   return respond("Every selected project must exist and belong to this brand.",403);
  const byId=new Map(projectRows.map(p=>[p.id,p]));
  const ordered=alternateVideoProducerCalendar(data.projectIds.map(id=>{
   const p=byId.get(id)!;
   return {id,title:p.title,mode:p.mode as "podcast"|"reels"};
  }));
  const start=data.localDate||defaultVideoProducerSchedule().localDate;
  const rows=ordered.map((project,index)=>{
   const localDate=calendarDayOffset(start,index);
   const at=parseVideoProducerLocalDateTime(localDate,data.localTime);
   validateFutureVideoProducerSchedule(at);
   return {project_id:project.id,brand_slug:brand.slug,channel_handle:data.channelHandle,
    publish_at:at.toISOString(),local_date:localDate,local_time:data.localTime,timezone:"America/New_York",
    title:project.title.slice(0,100).replace(/[\u2010-\u2015]/g," ").replace(/-/g," "),
    description:"",playlist_id:data.playlistId||null,thumbnail_variant:data.thumbnailVariant||null,status:"draft"};
  });
  const saved=await s.from("video_producer_schedule_drafts").insert(rows).select("id,project_id,local_date,local_time,status");
  if(saved.error)return respond(saved.error.code==="23505"?
   "That channel already has a scheduled item on one of these dates, or the project is already scheduled. Choose another start date.":saved.error.message,409);
  return NextResponse.json({drafts:saved.data||[],humanApprovalRequired:true},{status:201});
 }catch(e){return respond(e instanceof Error?e.message:"Could not create calendar drafts",409);}
}
export async function PATCH(request:Request){
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed||access.state!=="allowed"||!access.user)return respond("Forbidden",403);
 const parsed=patchSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return respond(parsed.error.issues[0]?.message||"Invalid update",400);
 const d=parsed.data;const s=createServiceClient();if(!s)return respond("Database unavailable",503);
 try{
  const scheduled=parseVideoProducerLocalDateTime(d.localDate,d.localTime);
  validateFutureVideoProducerSchedule(scheduled);
  const updated=await s.from("video_producer_schedule_drafts").update({
   local_date:d.localDate,local_time:d.localTime,publish_at:scheduled.toISOString(),
   title:d.title,description:d.description,thumbnail_variant:d.thumbnailVariant??null,playlist_id:d.playlistId??null
  }).eq("id",d.id).eq("status","draft").select("id").maybeSingle();
  if(updated.error)return respond(updated.error.message,409);
  if(!updated.data)return respond("Only unsubmitted calendar drafts can be edited.",409);
  return NextResponse.json({ok:true});
 }catch(e){return respond(e instanceof Error?e.message:"Invalid time",400);}
}
export async function DELETE(request:Request){
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed||access.state!=="allowed"||!access.user)return respond("Forbidden",403);
 const id=z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
 if(!id.success)return respond("Invalid schedule ID.",400);
 const s=createServiceClient();if(!s)return respond("Database unavailable",503);
 const changed=await s.from("video_producer_schedule_drafts").update({status:"canceled"})
  .eq("id",id.data).eq("status","draft").select("id").maybeSingle();
 if(changed.error)return respond(changed.error.message,500);
 if(!changed.data)return respond("Only unsent calendar drafts can be canceled.",409);
 return NextResponse.json({ok:true});
}

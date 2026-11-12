import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {put,del} from "@vercel/blob";
import sharp from "sharp";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request){
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed||access.state!=="allowed"||!access.user)return NextResponse.json({error:"Forbidden"},{status:403});
 const form=await request.formData().catch(()=>null);
 const scheduleId=form?.get("scheduleId"),file=form?.get("file");
 if(typeof scheduleId!=="string"||!/^[0-9a-f-]{36}$/i.test(scheduleId)||!(file instanceof File))
  return NextResponse.json({error:"Schedule draft ID and an image file are required."},{status:400});
 if(file.size<=0||file.size>15*1024*1024||!["image/png","image/jpeg","image/webp"].includes(file.type))
  return NextResponse.json({error:"Choose a PNG, JPEG, or WebP up to 15 MB."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Database unavailable"},{status:503});
 const draft=await service.from("video_producer_schedule_drafts")
  .select("id,project_id,status,custom_thumbnail_path").eq("id",scheduleId).maybeSingle();
 if(draft.error)return NextResponse.json({error:draft.error.message},{status:500});
 if(!draft.data||draft.data.status!=="draft")return NextResponse.json({error:"Only an unsent calendar draft can receive a custom thumbnail."},{status:409});
 let pathname="";
 try{
  const source=Buffer.from(await file.arrayBuffer());
  const output=await sharp(source).rotate().resize(1280,720,{fit:"cover",position:"attention"})
   .jpeg({quality:91,mozjpeg:true}).toBuffer();
  pathname=`video-producer/schedule-thumbnails/${draft.data.project_id}/${randomUUID()}.jpg`;
  const stored=await put(pathname,output,{access:"private",contentType:"image/jpeg",addRandomSuffix:false});
  const changed=await service.from("video_producer_schedule_drafts")
   .update({custom_thumbnail_path:stored.pathname,thumbnail_variant:null})
   .eq("id",scheduleId).eq("status","draft").select("id").maybeSingle();
  if(changed.error||!changed.data){await del(stored.pathname).catch(()=>{});return NextResponse.json({error:"Draft changed while uploading. Reload."},{status:409});}
  if(draft.data.custom_thumbnail_path)await del(draft.data.custom_thumbnail_path).catch(()=>{});
  return NextResponse.json({ok:true,size:"1280x720",message:"Custom thumbnail saved privately."});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Could not save thumbnail."},{status:500});}
}

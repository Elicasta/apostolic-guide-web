import {NextResponse} from "next/server";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {recordStudioAudit} from "@/studio-audit";
export const runtime="nodejs";

const id=z.string().uuid();
const episode=z.object({
 title:z.string().trim().min(1).max(180),
 start:z.number().finite().min(0),
 end:z.number().finite().positive(),
 shortStart:z.number().finite().min(0).optional(),
 shortEnd:z.number().finite().positive().optional()
}).strict();
const schema=z.object({projectId:id,episodes:z.array(episode).min(1).max(24)});
type Segment=z.infer<typeof episode>;

export function validateEpisodeWindows(segments:Segment[],duration:number){
 const sorted=[...segments].sort((a,b)=>a.start-b.start);
 const normalized:Array<Segment&{shortStart:number;shortEnd:number}>=[];
 let last=0;
 for(const entry of sorted){
  if(entry.start<last-.01)throw new Error("Mini episode ranges may not overlap.");
  if(entry.end>duration+.01||entry.end-entry.start<12)throw new Error("Each episode must be at least 12 seconds and stay inside the source duration.");
  const shortStart=entry.shortStart??entry.start;
  const shortEnd=entry.shortEnd??Math.min(entry.end,shortStart+40);
  const clipLength=shortEnd-shortStart;
  if(shortStart<entry.start-.01||shortEnd>entry.end+.01||clipLength<12||clipLength>60)
   throw new Error("Each Short must be between 12 and 60 seconds and entirely within its episode.");
  last=entry.end;
  normalized.push({...entry,shortStart,shortEnd});
 }
 const labels=new Set(sorted.map(s=>s.title.trim().toLowerCase()));
 if(labels.size!==sorted.length)throw new Error("Episode names must be unique within this split.");
 return normalized;
}

export async function GET(request:Request){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed")return NextResponse.json({error:"Forbidden"},{status:403});
 const rootId=new URL(request.url).searchParams.get("projectId");
 if(!id.safeParse(rootId).success)return NextResponse.json({error:"Invalid source project ID."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Database unavailable"},{status:503});
 const first=await service.from("video_producer_projects")
  .select("id,title,mode,status,source_range_start,source_range_end,brand_profile,parent_project_id")
  .eq("parent_project_id",rootId!).is("deleted_at",null).order("source_range_start");
 if(first.error)return NextResponse.json({error:first.error.message},{status:500});
 const episodes=(first.data||[]).filter(v=>v.mode==="podcast");
 if(!episodes.length)return NextResponse.json({episodes:[]});
 const second=await service.from("video_producer_projects")
  .select("id,title,mode,status,source_range_start,source_range_end,brand_profile,parent_project_id")
  .in("parent_project_id",episodes.map(v=>v.id)).eq("mode","reels").is("deleted_at",null);
 if(second.error)return NextResponse.json({error:second.error.message},{status:500});
 return NextResponse.json({episodes:episodes.map(e=>({...e,shorts:(second.data||[]).filter(v=>v.parent_project_id===e.id)}))});
}

export async function POST(request:Request){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed"||!access.user)return NextResponse.json({error:"Forbidden"},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||"Invalid episode split."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Database unavailable"},{status:503});
 const {projectId}=parsed.data;
 const rootResult=await service.from("video_producer_projects")
  .select("id,title,mode,parent_project_id,status,source_provider,source_locator,source_filename,source_mime_type,source_size_bytes,source_duration,source_range_start,source_range_end,transcript_text,transcript,brand_profile,pathway_slug,audio_plan,selected_music_track_id")
  .eq("id",projectId).is("deleted_at",null).maybeSingle();
 if(rootResult.error)return NextResponse.json({error:rootResult.error.message},{status:500});
 const root=rootResult.data;
 if(!root||root.mode!=="podcast"||root.parent_project_id||!root.source_locator||root.source_provider!=="vercel_blob")
  return NextResponse.json({error:"Select a root podcast with a completed private source upload."},{status:409});
 if(!root.transcript_text||["uploading","transcribing","directing","failed"].includes(root.status))
  return NextResponse.json({error:"Finish transcription and processing before splitting episodes."},{status:409});
 let segments:ReturnType<typeof validateEpisodeWindows>;
 try{segments=validateEpisodeWindows(parsed.data.episodes,Number(root.source_duration||0));}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid source windows"},{status:400});}
 const created:string[]=[];
 const shared={
  source_provider:root.source_provider,source_locator:root.source_locator,
  source_filename:root.source_filename,source_mime_type:root.source_mime_type,
  source_size_bytes:root.source_size_bytes,source_duration:root.source_duration,
  transcript_text:root.transcript_text,transcript:root.transcript,
  brand_profile:root.brand_profile||"apostolic-guide",pathway_slug:root.pathway_slug||null,
  audio_plan:root.audio_plan||{version:1,source:"camera_a"},
  selected_music_track_id:root.selected_music_track_id||null,
  created_by:access.user.id,updated_by:access.user.id,status:"uploaded"
 };
 try{
  const result=[];
  for(let i=0;i<segments.length;i++){
   const item=segments[i];
   const ep=await service.from("video_producer_projects").insert({
    ...shared,title:item.title,mode:"podcast",parent_project_id:root.id,
    source_range_start:item.start,source_range_end:item.end,
    director_metadata:{splitFromRoot:root.id,miniEpisodeIndex:i+1}
   }).select("id,title,mode,status,source_range_start,source_range_end").single();
   if(ep.error)throw new Error(ep.error.message);
   created.push(ep.data.id);
   const short=await service.from("video_producer_projects").insert({
    ...shared,title:item.title+" | Short",mode:"reels",parent_project_id:ep.data.id,
    source_range_start:item.shortStart,source_range_end:item.shortEnd,
    director_metadata:{splitFromRoot:root.id,matchingEpisodeId:ep.data.id,miniEpisodeIndex:i+1}
   }).select("id,title,mode,status,source_range_start,source_range_end").single();
   if(short.error)throw new Error(short.error.message);
   created.push(short.data.id);
   result.push({episode:ep.data,short:short.data});
  }
  await recordStudioAudit({actorUserId:access.user.id,action:"video_producer.episodes.split",resourceType:"video",resourceId:root.id,metadata:{count:result.length,sourceImmutable:true}});
  return NextResponse.json({created:result},{status:201});
 }catch(error){
  // Roll back only the projects created by this request. Never touch source media.
  // Children are removed before parents to avoid orphaned rows or wrong cascades.
  for(const id of [...created].reverse())await service.from("video_producer_projects").delete().eq("id",id).eq("status","uploaded");
  return NextResponse.json({error:error instanceof Error?error.message:"Could not split episodes. No source media was changed."},{status:409});
 }
}

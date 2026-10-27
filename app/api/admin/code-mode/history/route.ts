import {NextResponse} from "next/server";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {videoCodeV2Schema} from "@/code-mode/video-v2";

export const runtime="nodejs";
const idSchema=z.string().uuid();
export async function GET(request:Request){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed")return NextResponse.json({error:"Forbidden"},{status:403});
 const params=new URL(request.url).searchParams;
 const id=params.get("id")||"",kind=params.get("kind")||"";
 if(!["producer","studio"].includes(kind)||
   !(kind==="producer"?idSchema.safeParse(id).success:/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)))
   return NextResponse.json({error:"Invalid video project"},{status:400});
 const service=createServiceClient();
 if(!service)return NextResponse.json({error:"Checkpoint database unavailable"},{status:503});
 const checkpointId=params.get("checkpoint");
 if(checkpointId&&!idSchema.safeParse(checkpointId).success)return NextResponse.json({error:"Invalid checkpoint"},{status:400});
 let query=service.from("studio_code_mode_checkpoints").select("id,created_at,document")
   .eq("tool","video").eq("source_id",id).order("created_at",{ascending:false}).limit(30);
 if(checkpointId)query=query.eq("id",checkpointId);
 const result=await query;
 if(result.error)return NextResponse.json({error:result.error.message},{status:500});
 const items=(result.data||[]).flatMap(row=>{
   const original=row.document as Record<string,unknown>;
   const payload=(kind==="producer"
       ?(original.director_metadata as {videoCodeV2?:unknown}|null)?.videoCodeV2
       :(original.style as {videoCodeV2?:unknown}|null)?.videoCodeV2);
   const validated=videoCodeV2Schema.safeParse(payload);
   if(!validated.success||validated.data.id!==id||validated.data.kind!==kind)return [];
   return [{id:row.id,createdAt:row.created_at,sceneCount:validated.data.scenes.length,
     ...(checkpointId?{document:validated.data}:{})}];
 });
 if(checkpointId && !items.length)return NextResponse.json({error:"Version unavailable"},{status:404});
 return NextResponse.json(checkpointId?items[0]:{history:items},{headers:{"cache-control":"private, no-store"}});
}

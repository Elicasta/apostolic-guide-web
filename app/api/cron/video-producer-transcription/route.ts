import {NextResponse} from "next/server";
import {cronRequestAuthorized} from "@/cron-auth";
import {createServiceClient} from "@/supabase";
import {autoTranscribeDue} from "@/video-producer-upload-queue";
import {startVideoProducerTranscription} from "@/video-producer-transcription-start";

export const runtime="nodejs";
export const maxDuration=60;

/** Drain uploads even when the owner closes the browser after transfer. */
export async function GET(request:Request){
 if(!process.env.CRON_SECRET?.trim())return NextResponse.json({error:"CRON_SECRET is not configured."},{status:503});
 if(!cronRequestAuthorized(request))return NextResponse.json({error:"Unauthorized"},{status:401});
 const service=createServiceClient();
 if(!service)return NextResponse.json({error:"Database unavailable"},{status:503});
 const projects=await service.from("video_producer_projects")
  .select("id,director_metadata")
  .eq("status","uploaded").is("deleted_at",null).is("transcript_text",null)
  .contains("director_metadata",{autoTranscribe:{enabled:true}})
  .order("updated_at",{ascending:true}).limit(40);
 if(projects.error)return NextResponse.json({error:projects.error.message},{status:500});
 const due=(projects.data||[]).filter(p=>autoTranscribeDue(p.director_metadata)).slice(0,4);
 const results:Array<{projectId:string;state:string}>=[];
 for(const item of due){
  try{
   const result=await startVideoProducerTranscription({
    service,projectId:item.id,callbackOrigin:new URL(request.url).origin,autoOnly:true
   });
   results.push({projectId:item.id,state:result.state});
  }catch(error){
   console.error("Deferred Video Producer transcription failed",item.id,error instanceof Error?error.message:error);
   results.push({projectId:item.id,state:"retry_pending"});
  }
 }
 return NextResponse.json({ok:true,queued:(projects.data||[]).length,attempted:results.length,results});
}

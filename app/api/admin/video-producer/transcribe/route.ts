import {NextResponse} from "next/server";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {startVideoProducerTranscription} from "@/video-producer-transcription-start";

export const runtime="nodejs";
export const maxDuration=30;
const schema=z.object({projectId:z.string().uuid()});

export async function POST(request:Request){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed"||!access.user)return NextResponse.json({error:"Forbidden"},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid transcription request."},{status:400});
 const service=createServiceClient();
 if(!service)return NextResponse.json({error:"Supabase service access is not configured."},{status:503});
 try{
  const result=await startVideoProducerTranscription({
   service,projectId:parsed.data.projectId,
   callbackOrigin:new URL(request.url).origin,ownerUserId:access.user.id
  });
  if(result.state==="not_ready")return NextResponse.json({error:"Upload the source video before transcribing."},{status:409});
  return NextResponse.json({ok:true,projectId:parsed.data.projectId,status:result.state,workerRef:result.workerRef});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:"Could not start transcription."},{status:502});
 }
}

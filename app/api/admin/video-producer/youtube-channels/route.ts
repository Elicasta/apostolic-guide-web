import {NextResponse} from "next/server";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {getVideoProducerBrand} from "@/video-producer-brand-server";
import {videoProducerYouTubeAccessToken,verifyVideoProducerYouTubeChannel} from "@/video-producer-youtube-schedule-server";
export const runtime="nodejs";
export async function GET(request:Request){
 const {access,allowed}=await getStudioPermission("manage_distribution");
 if(!allowed||access.state!=="allowed")return NextResponse.json({error:"Forbidden"},{status:403});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Database unavailable"},{status:503});
 const slug=new URL(request.url).searchParams.get("brand")||"in-the-now";
 try{
  const profile=await getVideoProducerBrand(service,slug);
  if(profile.config.destination.type!=="youtube"||!profile.config.destination.youtubeHandle)return NextResponse.json({channels:[]});
  const token=await videoProducerYouTubeAccessToken();
  const channel=await verifyVideoProducerYouTubeChannel(token,profile.config.destination.youtubeHandle);
  return NextResponse.json({channels:[channel]});
 }catch(e){
  return NextResponse.json({channels:[],error:e instanceof Error?e.message:"YouTube channel could not be verified."},{status:409});
 }
}

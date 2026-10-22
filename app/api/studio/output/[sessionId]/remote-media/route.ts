import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import{NextResponse}from"next/server";import{getOutputSnapshot}from"@/studio/repository";import{createStudioLiveKitToken}from"@/studio/livekit";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{sessionId:string}>}){const{sessionId}=await params;const queryParams=new URL(request.url).searchParams;const outputToken=queryParams.get("token")??"";if(!outputToken)return NextResponse.json({error:"Missing output token"},{status:401});const snapshot=await getOutputSnapshot(sessionId,outputToken).catch(()=>null);if(!snapshot)return NextResponse.json({error:"Invalid output session"},{status:403});const isStudioOutputToken=snapshot.session.output_token_hash===createHash("sha256").update(outputToken).digest("hex");// A separate subscriber identity is required for each venue browser.
// Otherwise opening an additional screen can evict the OBS output.
const suppliedClientId=queryParams.get("client")??"";
const clientId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedClientId)
 ? suppliedClientId:randomUUID();
const remoteMedia=createStudioLiveKitToken({episodeId:snapshot.session.episode_id,identity:isStudioOutputToken?`output-${sessionId}`:`venue-output-${sessionId}-${clientId}`,name:"AG Program Output",role:"output",ttlSeconds:21600});const hostPreviewPublisher=isStudioOutputToken?createStudioLiveKitToken({episodeId:snapshot.session.episode_id,identity:`host-${sessionId}`,name:"Host",role:"producer",ttlSeconds:21600}):null;return NextResponse.json({remoteMedia,hostPreviewPublisher},{headers:{"Cache-Control":"no-store"}});}

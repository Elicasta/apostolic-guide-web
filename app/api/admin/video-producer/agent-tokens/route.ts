import {randomBytes} from "node:crypto";
import {NextResponse} from "next/server";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {hashVideoAgentToken} from "@/video-producer-agent-server";
import {videoAgentTokenRequestSchema} from "@/video-producer-agent-policy";
import {recordStudioAudit} from "@/studio-audit";
export const runtime="nodejs";

export async function GET(){
 const {access,allowed}=await getStudioPermission("manage_integrations");
 if(!allowed||access.state!=="allowed"||!access.user)return NextResponse.json({error:"Forbidden"},{status:403});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Database unavailable"},{status:503});
 const r=await service.from("video_producer_agent_tokens")
  .select("id,label,scopes,created_at,expires_at,revoked_at,last_used_at")
  .eq("created_by",access.user.id).order("created_at",{ascending:false}).limit(100);
 if(r.error)return NextResponse.json({error:r.error.message},{status:500});
 return NextResponse.json({tokens:r.data});
}
export async function POST(request:Request){
 const {access,allowed}=await getStudioPermission("manage_integrations");
 if(!allowed||access.state!=="allowed"||!access.user)return NextResponse.json({error:"Forbidden"},{status:403});
 const parsed=videoAgentTokenRequestSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid token scopes or expiry."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Database unavailable"},{status:503});
 const raw="vpa_"+randomBytes(32).toString("base64url");
 const expiry=new Date(Date.now()+parsed.data.expiresInDays*24*60*60*1000).toISOString();
 const saved=await service.from("video_producer_agent_tokens").insert({
  label:parsed.data.label,scopes:parsed.data.scopes,token_hash:hashVideoAgentToken(raw),
  expires_at:expiry,created_by:access.user.id
 }).select("id,label,scopes,expires_at").single();
 if(saved.error)return NextResponse.json({error:saved.error.message},{status:500});
 await recordStudioAudit({actorUserId:access.user.id,action:"video_producer.agent_token.created",resourceType:"video",metadata:{tokenId:saved.data.id,scopes:parsed.data.scopes,expiresAt:expiry}});
 return NextResponse.json({token:raw,record:saved.data,oneTimeOnly:true,notice:"Copy this token now. It will not be shown again."},{status:201});
}
export async function DELETE(request:Request){
 const {access,allowed}=await getStudioPermission("manage_integrations");
 if(!allowed||access.state!=="allowed"||!access.user)return NextResponse.json({error:"Forbidden"},{status:403});
 const parsed=z.object({id:z.string().uuid()}).safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid token ID"},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Database unavailable"},{status:503});
 const r=await service.from("video_producer_agent_tokens").update({revoked_at:new Date().toISOString()})
  .eq("id",parsed.data.id).eq("created_by",access.user.id).is("revoked_at",null).select("id").maybeSingle();
 if(r.error)return NextResponse.json({error:r.error.message},{status:500});
 return NextResponse.json({ok:Boolean(r.data)});
}

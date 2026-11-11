import "server-only";
import {createHash,timingSafeEqual} from "node:crypto";
import {createServiceClient} from "./supabase";

export const VIDEO_PRODUCER_AGENT_DRAFT_SCOPES = [
 "project:create","timeline:write","asset:upload","preview:request","status:read"
] as const;
export type VideoProducerAgentScope=typeof VIDEO_PRODUCER_AGENT_DRAFT_SCOPES[number];
export function isVideoProducerDraftScope(scope:string):scope is VideoProducerAgentScope{
 return (VIDEO_PRODUCER_AGENT_DRAFT_SCOPES as readonly string[]).includes(scope);
}
export const hashVideoProducerAgentToken=(token:string)=>createHash("sha256").update(token).digest("hex");
export function safeVideoProducerAgentToken(input:string):string|null{
 const match=/^Bearer (vpa_[A-Fa-f0-9]{64})$/.exec(input);
 return match?.[1]||null;
}
export async function requireVideoProducerAgent(request:Request,needed:VideoProducerAgentScope){
 const raw=safeVideoProducerAgentToken(request.headers.get("authorization")||"");
 if(!raw||!isVideoProducerDraftScope(needed))throw new Error("Invalid draft assistant token.");
 const service=createServiceClient();if(!service)throw new Error("Database unavailable.");
 const hash=hashVideoProducerAgentToken(raw);
 const r=await service.from("video_producer_agent_tokens")
  .select("id,token_hash,scopes,created_by,expires_at,revoked_at")
  .eq("token_hash",hash).maybeSingle();
 if(r.error||!r.data||r.data.revoked_at||new Date(r.data.expires_at).getTime()<=Date.now())
  throw new Error("Draft assistant token expired, revoked or unavailable.");
 const actual=Buffer.from(hash,"hex"),expected=Buffer.from(r.data.token_hash,"hex");
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))
  throw new Error("Invalid draft assistant token.");
 if(!Array.isArray(r.data.scopes)||!r.data.scopes.includes(needed))
  throw new Error("Draft assistant token does not grant "+needed+".");
 void service.from("video_producer_agent_tokens").update({last_used_at:new Date().toISOString()}).eq("id",r.data.id);
 return {service,actorUserId:r.data.created_by,tokenId:r.data.id,scope:needed};
}
export function videoProducerAgentError(error:unknown){
 const text=error instanceof Error?error.message:"Unauthorized";
 return {error:text,status:text==="Database unavailable."?503:401};
}

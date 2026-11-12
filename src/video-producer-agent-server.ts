import "server-only";
import {createHash} from "node:crypto";
import type {ServiceClient} from "./video-producer-server";
import {agentScopeSchema,type VideoAgentScope} from "./video-producer-agent-policy";

export function hashVideoAgentToken(raw:string){
 return createHash("sha256").update(raw).digest("hex");
}
export async function authenticateVideoAgent(request:Request,service:ServiceClient,scope:VideoAgentScope){
 const header=request.headers.get("authorization")||"";
 const found=/^Bearer (vpa_[A-Za-z0-9_-]{40,80})$/.exec(header);
 if(!found)return null;
 const token=await service.from("video_producer_agent_tokens")
  .select("id,label,scopes,created_by,expires_at")
  .eq("token_hash",hashVideoAgentToken(found[1]))
  .is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(token.error||!token.data||!Array.isArray(token.data.scopes)||!token.data.scopes.includes(scope)||!agentScopeSchema.safeParse(scope).success)return null;
 // Token material is never logged or stored in plaintext.
 await service.from("video_producer_agent_tokens").update({last_used_at:new Date().toISOString()}).eq("id",token.data.id);
 return token.data;
}

import {z} from "zod";

export const agentScopeSchema=z.enum(["draft:projects","draft:timeline","draft:assets","draft:preview","draft:read"]);
export type VideoAgentScope=z.infer<typeof agentScopeSchema>;
export const VIDEO_AGENT_MAX_TTL_DAYS=30;
export const videoAgentTokenRequestSchema=z.object({
 label:z.string().trim().min(1).max(100),
 scopes:z.array(agentScopeSchema).min(1).max(5).refine(v=>new Set(v).size===v.length,"Duplicate scopes"),
 expiresInDays:z.number().int().min(1).max(VIDEO_AGENT_MAX_TTL_DAYS).default(7)
}).strict();
export const ACTION_SCOPE={
 createProject:"draft:projects",
 applyTimeline:"draft:timeline",
 authorizeAsset:"draft:assets",
 commitAsset:"draft:assets",
 requestPreview:"draft:preview"
} as const satisfies Record<string,VideoAgentScope>;
export type VideoAgentAction=keyof typeof ACTION_SCOPE;
export function isVideoAgentAction(raw:string):raw is VideoAgentAction{
 return Object.prototype.hasOwnProperty.call(ACTION_SCOPE,raw);
}
export function isVideoProducerAgentEditable(input:{status:string;approval_fingerprint?:string|null}){
 return ["draft","uploaded","planned"].includes(input.status)&&!input.approval_fingerprint;
}
export function canAgentPerform(input:{scope:VideoAgentScope;action:string;status?:string;approved?:boolean}){
 if(!isVideoAgentAction(input.action)||ACTION_SCOPE[input.action]!==input.scope)return false;
 if(input.action==="createProject")return true;
 return isVideoProducerAgentEditable({status:input.status||"",approval_fingerprint:input.approved?"approved":null});
}

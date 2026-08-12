import { createHmac } from "node:crypto";

export type StudioLiveKitRole = "guest" | "output" | "producer";

function b64url(value:string|Buffer){return Buffer.from(value).toString("base64url");}
function signJwt(payload:Record<string,unknown>,secret:string){const header=b64url(JSON.stringify({alg:"HS256",typ:"JWT"}));const body=b64url(JSON.stringify(payload));const unsigned=`${header}.${body}`;const signature=createHmac("sha256",secret).update(unsigned).digest("base64url");return `${unsigned}.${signature}`;}

export function liveKitConfigured(){return Boolean(process.env.LIVEKIT_URL&&process.env.LIVEKIT_API_KEY&&process.env.LIVEKIT_API_SECRET);}
export function studioRoomName(episodeId:string){return `ag-studio-${episodeId}`;}

export function createStudioLiveKitToken(input:{episodeId:string;identity:string;name:string;role:StudioLiveKitRole;ttlSeconds?:number}){
 const url=process.env.LIVEKIT_URL,apiKey=process.env.LIVEKIT_API_KEY,secret=process.env.LIVEKIT_API_SECRET;
 if(!url||!apiKey||!secret)return null;
 const now=Math.floor(Date.now()/1000),ttl=Math.max(60,Math.min(input.ttlSeconds??3600,21600));
 const publish=input.role!=="output";
 const subscribe=input.role!=="guest"||true;
 const token=signJwt({iss:apiKey,sub:input.identity,name:input.name,nbf:now-5,exp:now+ttl,metadata:JSON.stringify({agRole:input.role,episodeId:input.episodeId}),video:{room:studioRoomName(input.episodeId),roomJoin:true,canPublish:publish,canSubscribe:subscribe,canPublishData:publish,canUpdateOwnMetadata:false}},secret);
 return {url,token,room:studioRoomName(input.episodeId),identity:input.identity,role:input.role};
}

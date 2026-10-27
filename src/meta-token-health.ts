import "server-only";
import { createServiceClient } from "./supabase";

export type MetaTokenHealth={
 platform:"instagram"|"threads";
 state:"valid"|"expired"|"missing"|"unavailable";
 expiresAt:string|null;
 daysRemaining:number|null;
 expiringSoon:boolean;
 refreshed:boolean;
 detail:string;
};
const day=86400000;
const names={
 instagram:{access:"meta_instagram_access_token",expires:"meta_instagram_expires_at",issued:"meta_instagram_refreshed_at",url:"https://graph.instagram.com"},
 threads:{access:"meta_threads_access_token",expires:"meta_threads_expires_at",issued:"meta_threads_refreshed_at",url:"https://graph.threads.net"}
} as const;

function jsonObject(raw:unknown):Record<string,unknown>{return raw && typeof raw==="object" && !Array.isArray(raw)?raw as Record<string,unknown>:{};}
function daysUntil(value:string|null){if(!value)return null;const d=new Date(value).getTime();return Number.isFinite(d)?Math.ceil((d-Date.now())/day):null;}
export async function getMetaTokenHealth(platform:"instagram"|"threads",refresh=true):Promise<MetaTokenHealth> {
 const service=createServiceClient(),spec=names[platform];
 const fallback=(state:MetaTokenHealth["state"],detail:string):MetaTokenHealth=>({platform,state,expiresAt:null,daysRemaining:null,expiringSoon:false,refreshed:false,detail});
 if(!service)return fallback("unavailable","Secret store unavailable.");
 try{
  const result=await service.schema("analytics").from("integration_secrets").select("name,secret,updated_at")
    .in("name",[spec.access,spec.expires,spec.issued]);
  if(result.error)throw new Error(result.error.message);
  const rows=new Map((result.data||[]).map(r=>[String(r.name),String(r.secret)]));
  let token=rows.get(spec.access)||"";
  let expiresAt=rows.get(spec.expires)||null;
  if(!token)return fallback("missing","No access token is stored.");
  let refreshed=false;
  const remaining=daysUntil(expiresAt);
  if(refresh && remaining!==null && remaining<=7 && remaining>0){
   const last=rows.get(spec.issued)||result.data?.find(r=>r.name===spec.access)?.updated_at;
   const issuedAt=last?new Date(last).getTime():NaN;
   if(Number.isFinite(issuedAt) && Date.now()-issuedAt>=day){
    const url=new URL(spec.url+"/refresh_access_token");
    url.searchParams.set("grant_type",platform==="threads"?"th_refresh_token":"ig_refresh_token");
    url.searchParams.set("access_token",token);
    const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(10000)});
    const data=jsonObject(await response.json().catch(()=>null));
    const rotated=typeof data.access_token==="string"?data.access_token:"";
    const duration=Number(data.expires_in);
    if(response.ok && rotated && Number.isFinite(duration) && duration>3600){
     token=rotated;
     expiresAt=new Date(Date.now()+duration*1000).toISOString();
     const now=new Date().toISOString();
     const stored=await service.schema("analytics").from("integration_secrets").upsert([
      {name:spec.access,secret:token,updated_at:now},
      {name:spec.expires,secret:expiresAt,updated_at:now},
      {name:spec.issued,secret:now,updated_at:now}
     ],{onConflict:"name"});
     if(stored.error)throw new Error("Refreshed token could not be stored. "+stored.error.message);
     refreshed=true;
    }
   }
  }
  const live=await fetch(spec.url+(platform==="threads"?"/v1.0/me?fields=id,username":"/v24.0/me?fields=id,username"),
   {headers:{Authorization:"Bearer "+token},cache:"no-store",signal:AbortSignal.timeout(12000)});
  const body=jsonObject(await live.json().catch(()=>null));
  const error=jsonObject(body.error);
  const remainingNow=daysUntil(expiresAt);
  const detail=typeof error.message==="string"?String(error.message).slice(0,200):"Token verified against Meta.";
  if(!live.ok){
   const code=Number(error.code||0);
   const state=live.status===401 || [190,102].includes(code)?"expired":"unavailable";
   return {platform,state,expiresAt,daysRemaining:remainingNow,expiringSoon:remainingNow!==null&&remainingNow<=7,refreshed,detail};
  }
  return {platform,state:"valid",expiresAt,daysRemaining:remainingNow,expiringSoon:remainingNow!==null&&remainingNow<=7,refreshed,
   detail:refreshed?"Verified and long-lived token refreshed.":"Token verified against Meta."};
 }catch(error){return fallback("unavailable",error instanceof Error?error.message:"Token health check unavailable.");}
}

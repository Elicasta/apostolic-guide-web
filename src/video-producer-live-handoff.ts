export const MAX_LIVE_IMPORT_BYTES=512*1024*1024;
export function isTrustedLiveStudioOrigin(origin:string){
 try{
  const u=new URL(origin);
  if(u.protocol!=="https:"||u.origin!==origin)return false;
  return u.hostname==="live.apostolicguide.com"||u.hostname==="studio.apostolicguide.com"||
    /^apostolic-guide-live-[a-z0-9-]+-elicastas-projects\.vercel\.app$/.test(u.hostname);
 }catch{return false;}
}
export function isValidHandoffId(id:string){return /^[0-9a-f-]{36}$/i.test(id);}
export function validLiveRecording(file:unknown){
 if(typeof File==="undefined"||!(file instanceof File))return false;
 return file.size>0&&file.size<=MAX_LIVE_IMPORT_BYTES&&
   ["video/mp4","video/webm","video/quicktime"].includes(file.type);
}

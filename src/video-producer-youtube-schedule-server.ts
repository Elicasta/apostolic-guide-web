import "server-only";
import {getSocialPublishingCredentialValues} from "./social-publishing-integrations";

type YouTubeTokenResponse={access_token?:string;error?:string;error_description?:string};
type Channel={id:string;snippet?:{title?:string;customUrl?:string}};
async function googleResponse(response:Response,action:string){
 if(response.ok)return response.json() as Promise<Record<string,unknown>>;
 const raw=(await response.text().catch(()=>"")).slice(0,600);
 throw new Error(`${action} failed (HTTP ${response.status}). ${raw}`);
}
export async function videoProducerYouTubeAccessToken(){
 const credentials=await getSocialPublishingCredentialValues("youtube") as Record<string,string>;
 if(!credentials.clientId||!credentials.clientSecret||!credentials.refreshToken)
  throw new Error("YouTube is not connected. Reauthorize it in Admin Setup with YouTube upload and playlist permission.");
 const response=await fetch("https://oauth2.googleapis.com/token",{
  method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},cache:"no-store",
  body:new URLSearchParams({client_id:credentials.clientId,client_secret:credentials.clientSecret,
   refresh_token:credentials.refreshToken,grant_type:"refresh_token"})
 });
 const parsed=await response.json().catch(()=>({})) as YouTubeTokenResponse;
 if(!response.ok||!parsed.access_token)throw new Error(parsed.error_description||parsed.error||"Google could not refresh the connected YouTube token.");
 return parsed.access_token;
}
export async function verifyVideoProducerYouTubeChannel(token:string,expectedHandle:string){
 if(!/^@[a-zA-Z0-9_.-]+$/.test(expectedHandle)||/cornerstone/i.test(expectedHandle))
  throw new Error("The selected YouTube channel is not permitted for this brand.");
 const headers={authorization:`Bearer ${token}`};
 const [ownedResponse,expectedResponse]=await Promise.all([
  fetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",{headers,cache:"no-store"}),
  fetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle="+encodeURIComponent(expectedHandle),{headers,cache:"no-store"})
 ]);
 const owned=await googleResponse(ownedResponse,"Connected YouTube channel lookup");
 const expected=await googleResponse(expectedResponse,"Brand YouTube channel lookup");
 const ownedChannels=(owned.items as Channel[]|undefined)||[];
 const expectedChannel=((expected.items as Channel[]|undefined)||[])[0];
 const matched=ownedChannels.find(channel=>channel.id&&channel.id===expectedChannel?.id);
 if(!matched)throw new Error(`The connected YouTube OAuth account does not own ${expectedHandle}. Reconnect YouTube while selecting that exact channel. No video was uploaded.`);
 return {id:matched.id,title:matched.snippet?.title||expectedHandle,handle:expectedHandle};
}
export async function uploadScheduledVideoToYouTube(input:{
 token:string;sourceUrl:string;title:string;description:string;publishAt:string
}):Promise<string>{
 const source=await fetch(input.sourceUrl,{cache:"no-store"});
 if(!source.ok||!source.body)throw new Error(`Private review master could not be opened (HTTP ${source.status}).`);
 const bytes=Number(source.headers.get("content-length"));
 if(!Number.isSafeInteger(bytes)||bytes<=0)throw new Error("Private video must expose its content length for resumable upload.");
 const init=await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",{
  method:"POST",headers:{
   authorization:`Bearer ${input.token}`,"content-type":"application/json; charset=UTF-8",
   "x-upload-content-length":String(bytes),"x-upload-content-type":"video/mp4"
  },
  body:JSON.stringify({
   snippet:{title:input.title.slice(0,100),description:input.description.slice(0,5000),categoryId:"22"},
   status:{privacyStatus:"private",publishAt:input.publishAt,embeddable:true,selfDeclaredMadeForKids:false}
  })
 });
 if(!init.ok)await googleResponse(init,"YouTube schedule initialization");
 const url=init.headers.get("location");
 if(!url||!url.startsWith("https://www.googleapis.com/"))
  throw new Error("YouTube returned an invalid resumable upload URL.");
 const upload=await fetch(url,{
  method:"PUT",headers:{authorization:`Bearer ${input.token}`,"content-type":"video/mp4","content-length":String(bytes)},
  body:source.body,duplex:"half"
 } as RequestInit&{duplex:"half"});
 const response=await googleResponse(upload,"YouTube scheduled video upload");
 const id=response.id;
 if(typeof id!=="string"||!/^[-_a-zA-Z0-9]{8,20}$/.test(id))
  throw new Error("YouTube did not confirm a valid uploaded video ID. Check YouTube Studio before retrying.");
 return id;
}
export async function attachYouTubeVideoThumbnail(token:string,videoId:string,privateUrl:string){
 const response=await fetch(privateUrl,{cache:"no-store"});
 if(!response.ok||!response.body)throw new Error("Private thumbnail cannot be downloaded.");
 const length=Number(response.headers.get("content-length"));
 if(!Number.isSafeInteger(length)||length<=0||length>50*1024*1024)
  throw new Error("YouTube thumbnails require a valid JPEG or PNG under 50 MB.");
 const mime=response.headers.get("content-type")||"image/jpeg";
 if(!["image/png","image/jpeg"].includes(mime.split(";")[0].trim()))throw new Error("Thumbnail must be PNG or JPEG.");
 const set=await fetch("https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId="+encodeURIComponent(videoId),{
  method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":mime,"content-length":String(length)},
  body:response.body,duplex:"half"
 } as RequestInit&{duplex:"half"});
 await googleResponse(set,"YouTube custom thumbnail");
}
export async function addVideoProducerYouTubePlaylist(token:string,videoId:string,playlistId:string){
 if(!/^[A-Za-z0-9_-]{8,120}$/.test(playlistId))throw new Error("Invalid YouTube playlist identifier.");
 const r=await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",{
  method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
  body:JSON.stringify({snippet:{playlistId,resourceId:{kind:"youtube#video",videoId}}})
 });
 await googleResponse(r,"YouTube playlist add. Reauthorize with youtube.force-ssl if permission is insufficient");
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Instagram, KeyRound, Link2, Loader2, MessageCircle, Music2, Save, Youtube } from "lucide-react";
import type { SocialPublishingCredentialStatus, SocialPublishingPlatform } from "./social-publishing-integrations";

type FormValues = Record<string, string>;
type Field = { key:string; label:string; secret?:boolean; placeholder?:string; help?:string };
type PlatformSpec = { platform:SocialPublishingPlatform; title:string; description:string; fields:Field[] };

const YOUTUBE_CALLBACK = "https://apostolicguide.com/api/admin/youtube/oauth/callback";
const THREADS_CALLBACK = "https://apostolicguide.com/api/admin/meta/threads/callback";
const THREADS_UNINSTALL = "https://apostolicguide.com/api/meta/threads/deauthorize";
const THREADS_DELETE = "https://apostolicguide.com/api/meta/threads/delete";

const SPECS: PlatformSpec[] = [
  { platform:"youtube", title:"YouTube", description:"OAuth app credentials for direct uploads, metadata, thumbnails, scheduling, and channel analytics.", fields:[
    {key:"clientId",label:"OAuth Client ID",placeholder:"Google Cloud OAuth client ID"},
    {key:"clientSecret",label:"OAuth Client Secret",secret:true,placeholder:"Leave blank to keep stored secret"},
    {key:"apiKey",label:"API Key",secret:true,placeholder:"Optional for public/read requests"},
    {key:"channelId",label:"Channel ID",placeholder:"Optional. Discovered after OAuth when available."}
  ]},
  { platform:"instagram", title:"Instagram / Meta", description:"Reuses the Meta credentials already powering Instagram messaging and adds the App ID needed for publishing OAuth.", fields:[
    {key:"appId",label:"Meta App ID",placeholder:"Meta developer app ID"},
    {key:"appSecret",label:"Meta App Secret",secret:true,placeholder:"Leave blank to keep stored secret"},
    {key:"accessToken",label:"Instagram Access Token",secret:true,placeholder:"Leave blank to keep the existing token"},
    {key:"instagramUserId",label:"Instagram User ID",placeholder:"Professional Instagram account ID"},
    {key:"graphVersion",label:"Graph API Version",placeholder:"v24.0"}
  ]},
  { platform:"threads", title:"Threads", description:"Threads App credentials plus the authorized user token used for direct text publishing and scheduled posts.", fields:[
    {key:"appId",label:"Threads App ID",placeholder:"Threads App ID from Meta → Access the Threads API"},
    {key:"appSecret",label:"Threads App Secret",secret:true,placeholder:"Leave blank to keep stored secret"},
    {key:"accessToken",label:"Threads Access Token",secret:true,placeholder:"Paste a long-lived Threads user token here",help:"Generate this in Meta's Threads User Token Generator. Keep it here in Studio; do not send it in chat."},
    {key:"userId",label:"Threads User ID",placeholder:"App-scoped Threads user ID"},
    {key:"username",label:"Threads Username",placeholder:"apostolicguide"}
  ]},
  { platform:"tiktok", title:"TikTok", description:"TikTok Login Kit + Content Posting API credentials for Direct Post once the app is approved for video.publish.", fields:[
    {key:"clientKey",label:"Client Key",placeholder:"TikTok developer client key"},
    {key:"clientSecret",label:"Client Secret",secret:true,placeholder:"Leave blank to keep stored secret"},
    {key:"accessToken",label:"Access Token",secret:true,placeholder:"Usually added by Connect TikTok later"},
    {key:"refreshToken",label:"Refresh Token",secret:true,placeholder:"Usually added by Connect TikTok later",help:"TikTok access tokens expire. Publishing will use the refresh token server-side and replace rotated refresh tokens automatically."},
    {key:"openId",label:"Open ID",placeholder:"Authorized TikTok user ID"}
  ]}
];

function icon(platform:SocialPublishingPlatform){if(platform==="youtube")return <Youtube size={20}/>;if(platform==="instagram")return <Instagram size={20}/>;if(platform==="threads")return <MessageCircle size={20}/>;return <Music2 size={20}/>;}
function emptyForms(){return Object.fromEntries(SPECS.map(spec=>[spec.platform,{}])) as Record<SocialPublishingPlatform,FormValues>;}
function oauthMessage(code:string|null){if(code==="connected")return "YouTube connected. The refresh authorization is stored server-side and will be used for uploads.";if(code==="denied")return "YouTube authorization was cancelled or denied.";if(code==="invalid_state")return "YouTube authorization expired or could not be verified. Try Connect YouTube again.";if(code==="missing_credentials")return "Save the YouTube OAuth Client ID and Client Secret before connecting the channel.";if(code==="credential_error")return "The YouTube credentials could not be loaded from the server-only secret store.";if(code==="token_error")return "Google did not accept the OAuth callback. Confirm the authorized redirect URI in Google Cloud and try again.";if(code==="no_refresh_token")return "Google did not return offline authorization. Reconnect YouTube and approve access again.";if(code==="server_error")return "YouTube authorization reached Apostolic Guide but could not be saved. Try again.";return "";}

export function SocialPublishingCredentials(){
  const[statuses,setStatuses]=useState<SocialPublishingCredentialStatus[]>([]);const[forms,setForms]=useState<Record<SocialPublishingPlatform,FormValues>>(emptyForms);const[busy,setBusy]=useState<SocialPublishingPlatform|"load"|null>("load");const[message,setMessage]=useState("");
  const statusMap=useMemo(()=>new Map(statuses.map(status=>[status.platform,status])),[statuses]);
  const load=useCallback(async()=>{setBusy("load");try{const response=await fetch("/api/admin/setup/social-publishing",{cache:"no-store"});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Publishing credentials could not be loaded.");setStatuses(Array.isArray(data.platforms)?data.platforms:[]);}catch(error){setMessage(error instanceof Error?error.message:"Publishing credentials could not be loaded.");}finally{setBusy(null);}},[]);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);const oauth=oauthMessage(params.get("youtube"));if(oauth){setMessage(oauth);params.delete("youtube");const query=params.toString();window.history.replaceState({},"",`${window.location.pathname}${query?`?${query}`:""}${window.location.hash}`);}void load();},[load]);
  function update(platform:SocialPublishingPlatform,key:string,value:string){setForms(current=>({...current,[platform]:{...current[platform],[key]:value}}));}
  async function save(platform:SocialPublishingPlatform){setBusy(platform);setMessage("");try{const response=await fetch("/api/admin/setup/social-publishing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({platform,values:forms[platform]})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Credentials could not be saved.");setStatuses(Array.isArray(data.platforms)?data.platforms:[]);setForms(current=>({...current,[platform]:{}}));setMessage(`${SPECS.find(spec=>spec.platform===platform)?.title??platform} credentials saved. Stored values were not returned to this browser.`);}catch(error){setMessage(error instanceof Error?error.message:"Credentials could not be saved.");}finally{setBusy(null);}}
  return <section className="admin-card social-publishing-credentials">
    <div className="credential-heading"><div><span className="section-kicker">Channel infrastructure</span><h2>Social publishing credentials</h2><p>Store the app credentials and account authorization needed by Channel Publishing. Secrets are written through server-only routes and never read back into the browser.</p></div><div className="credential-security"><KeyRound size={16}/><span>Server-only secret store</span></div></div>
    {message?<div className="admin-notice credential-notice">{message}</div>:null}{busy==="load"?<div className="credential-loading"><Loader2 className="spin" size={18}/> Loading connection status…</div>:null}
    <div className="credential-platform-grid">{SPECS.map(spec=>{const status=statusMap.get(spec.platform);const saving=busy===spec.platform;return <article className="credential-platform" key={spec.platform}>
      <div className="credential-platform-head"><div className={`credential-platform-icon is-${spec.platform}`}>{icon(spec.platform)}</div><div><h3>{spec.title}</h3><p>{spec.description}</p></div></div>
      <div className="credential-status-row"><span className={status?.appConfigured?"credential-status is-ready":"credential-status"}>{status?.appConfigured?<CheckCircle2 size={14}/>:<CircleAlert size={14}/>} App credentials {status?.appConfigured?"stored":"missing"}</span><span className={status?.accountAuthorized?"credential-status is-ready":"credential-status"}>{status?.accountAuthorized?<CheckCircle2 size={14}/>:<CircleAlert size={14}/>} Account {status?.accountAuthorized?"authorized":"not authorized"}</span></div>
      {status?.accountLabel?<div className="credential-account-label">Account: <strong>{status.accountLabel}</strong></div>:null}
      {spec.platform==="youtube"?<div className="credential-oauth-note"><div><Link2 size={14}/><strong>Google authorized redirect URI</strong></div><code>{YOUTUBE_CALLBACK}</code><small>Add this exact URI to Google Cloud → Google Auth Platform → Clients → Apostolic Guide → Authorized redirect URIs.</small></div>:null}
      {spec.platform==="threads"?<div className="credential-oauth-note"><div><Link2 size={14}/><strong>Meta Threads callback URLs</strong></div><code>{THREADS_CALLBACK}</code><code>{THREADS_UNINSTALL}</code><code>{THREADS_DELETE}</code><small>Enter all three in Meta Threads settings. For the redirect field, select/click the URL suggestion so Meta registers it before saving.</small></div>:null}
      <div className="credential-fields">{spec.fields.map(field=>{const stored=Boolean(status?.fields?.[field.key]);return <label key={field.key}><span>{field.label}{stored?<em>Stored</em>:null}</span><input type={field.secret?"password":"text"} autoComplete="off" value={forms[spec.platform][field.key]??""} placeholder={stored?"Stored securely · enter a value only to replace it":field.placeholder} onChange={event=>update(spec.platform,field.key,event.target.value)}/>{field.help?<small>{field.help}</small>:null}</label>;})}</div>
      <div className="credential-platform-footer"><small>{status?.updatedAt?`Last updated ${new Date(status.updatedAt).toLocaleString()}`:"No credentials saved yet."}</small><div className="credential-actions">{spec.platform==="youtube"?<a className="button" aria-disabled={!status?.appConfigured||Boolean(busy)} href={status?.appConfigured&&!busy?"/api/admin/youtube/oauth/start":undefined}><Youtube size={15}/> {status?.accountAuthorized?"Reconnect YouTube":"Connect YouTube"}</a>:null}<button type="button" className="button primary" disabled={Boolean(busy)} onClick={()=>void save(spec.platform)}>{saving?<Loader2 className="spin" size={15}/>:<Save size={15}/>} Save {spec.title}</button></div></div>
    </article>;})}</div>
    <div className="credential-next-step"><strong>Channel authorization is separate from app credentials.</strong><p>YouTube uses OAuth. Instagram keeps using its existing Meta connection. Threads can be connected now with a long-lived user token from Meta's Threads User Token Generator; the automated OAuth callback can replace that later without changing the publishing workflow.</p></div>
  </section>;
}

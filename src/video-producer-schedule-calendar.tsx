"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {CalendarDays,CheckCircle2,ExternalLink,Loader2,ShieldCheck,Upload} from "lucide-react";

type Project={id:string;title:string;mode:"podcast"|"reels";status:string;hasSource:boolean};
type Draft={id:string;project_id:string;brand_slug:string;channel_handle:string;local_date:string;local_time:string;publish_at:string;title:string;description:string;playlist_id:string|null;thumbnail_variant:"A"|"B"|null;status:string;youtube_video_id:string|null;error_message:string|null};
type Brand={slug:string;name:string;config:{destination:{type:string;youtubeHandle:string|null}}};
type Loaded={brand:Brand;defaultSlot:{localDate:string;localTime:string};projects:Project[];drafts:Draft[]};
type Channel={id:string;handle:string;title:string};
async function json<T>(url:string,init?:RequestInit):Promise<T>{
 const response=await fetch(url,{...init,cache:"no-store",
  headers:{"content-type":"application/json",...(init?.headers||{})}});
 const body=await response.json().catch(()=>({})) as T&{error?:string};
 if(!response.ok)throw new Error(body.error||`Request failed (${response.status}).`);
 return body;
}
const localLabel=(date:string,time:string)=>new Date(date+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"})+" at "+time+" ET";
export function VideoProducerScheduleCalendar(){
 const [data,setData]=useState<Loaded|null>(null);
 const [channels,setChannels]=useState<Channel[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [start,setStart]=useState(""),[clock,setClock]=useState("18:00");
 const [channel,setChannel]=useState(""),[playlist,setPlaylist]=useState("");
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [edits,setEdits]=useState<Record<string,Partial<Draft>>>({});
 const load=useCallback(async()=>{
  const result=await json<Loaded>("/api/admin/video-producer/schedule?brand=in-the-now");
  setData(result);setStart(current=>current||result.defaultSlot.localDate);
  setClock(current=>current||result.defaultSlot.localTime);
  setChannel(result.brand.config.destination.youtubeHandle||"");
 },[]);
 useEffect(()=>{
  let live=true;
  void load().catch(e=>{if(live)setError(e instanceof Error?e.message:"Could not load calendar");});
  void json<{channels:Channel[]}>("/api/admin/video-producer/youtube-channels?brand=in-the-now")
   .then(result=>{if(live)setChannels(result.channels||[]);})
   .catch(e=>{if(live)setError(e instanceof Error?e.message:"Connect YouTube in Admin Setup.");});
  return ()=>{live=false;};
 },[load]);
 const byId=new Map((data?.projects||[]).map(project=>[project.id,project]));
 const projectAvailable=(data?.projects||[]).filter(p=>p.hasSource&&p.status!=="failed");
 const drafts=data?.drafts||[];
 const canCreate=Boolean(!busy&&channels.some(ch=>ch.handle.toLowerCase()===channel.toLowerCase())&&selected.length&&start&&clock);
 const action=async(label:string,fn:()=>Promise<unknown>)=>{
  setBusy(label);setError("");setMessage("");
  try{await fn();await load();setMessage(label+" completed.");}catch(e){setError(e instanceof Error?e.message:"Action failed.");}
  finally{setBusy("");}
 };
 const patch=(id:string,change:Partial<Draft>)=>setEdits(current=>({...current,[id]:{...current[id],...change}}));
 async function uploadCustomThumbnail(id:string,file:File){
  setBusy("Uploading image");setError("");
  try{
   const form=new FormData();form.set("scheduleId",id);form.set("file",file);
   const response=await fetch("/api/admin/video-producer/schedule-thumbnail",{method:"POST",body:form});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||"Thumbnail upload failed.");
   setMessage("Private custom thumbnail saved at 1280 × 720.");
  }catch(e){setError(e instanceof Error?e.message:"Thumbnail upload failed.");}
  finally{setBusy("");}
 }
 return <main className="vp-calendar">
  <header className="vp-calendar-head">
   <div><Link href="/admin/video-producer" className="vp-calendar-back">Video Producer</Link>
    <div className="vp-calendar-eyebrow"><CalendarDays size={16}/> Release calendar</div>
    <h1>Schedule In the Now</h1><p>One video per day, alternating full episodes and Shorts. Nothing is sent to YouTube until you confirm each item.</p>
   </div>
   <span className="vp-calendar-pill"><ShieldCheck size={15}/> Human approval required</span>
  </header>
  {error?<div className="vp-calendar-alert" role="alert">{error}</div>:null}
  {message?<div className="vp-calendar-note" role="status">{message}</div>:null}
  <section className="vp-calendar-panel">
   <div className="vp-calendar-heading"><h2>Build a calendar</h2><p>Select rendered or in-progress projects. The final upload button becomes available after each video is reviewed.</p></div>
   <div className="vp-calendar-fields">
    <label>Channel<select value={channel} onChange={e=>setChannel(e.target.value)}>
     {channels.length?channels.map(ch=><option key={ch.id} value={ch.handle}>{ch.title} ({ch.handle})</option>):<option value="">YouTube not verified</option>}
    </select></label>
    <label>First publish date<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
    <label>Publish time, New York<input type="time" value={clock} onChange={e=>setClock(e.target.value)}/></label>
    <label>Playlist ID, optional<input value={playlist} onChange={e=>setPlaylist(e.target.value)} placeholder="YouTube playlist ID"/></label>
   </div>
   <div className="vp-calendar-projects">
    {projectAvailable.map(project=><label className="vp-calendar-project" key={project.id}>
     <input type="checkbox" checked={selected.includes(project.id)}
      onChange={e=>setSelected(old=>e.target.checked?[...old,project.id]:old.filter(id=>id!==project.id))}/>
     <span><strong>{project.title}</strong><small>{project.mode==="podcast"?"Full episode":"Short"} · {project.status}</small></span>
    </label>)}
    {!projectAvailable.length?<p>No uploaded personal brand projects exist yet. <Link href="/admin/video-producer/new">Create a project.</Link></p>:null}
   </div>
   <div className="vp-calendar-actions">
    <span>{selected.length} selected. Alternates episode, Short, episode, Short.</span>
    <button disabled={!canCreate} onClick={()=>void action("Calendar draft creation",async()=>{
     await json("/api/admin/video-producer/schedule",{method:"POST",body:JSON.stringify({
      brandSlug:data!.brand.slug,channelHandle:channel,projectIds:selected,localDate:start,localTime:clock,playlistId:playlist||undefined
     })});
     setSelected([]);
    })}>{busy?<Loader2 size={15}/>:<CalendarDays size={15}/>} Create calendar drafts</button>
   </div>
  </section>
  <section className="vp-calendar-panel">
   <div className="vp-calendar-heading"><h2>Daily release queue</h2><p>Save metadata and choose A, B, or your own image. Every item has a separate final confirmation.</p></div>
   <div className="vp-calendar-queue">{drafts.map(draft=>{
    const project=byId.get(draft.project_id);
    const current={...draft,...edits[draft.id]};
    const ready=Boolean(project&&["review","completed"].includes(project.status));
    const editing=draft.status==="draft";
    return <article key={draft.id} className="vp-calendar-entry">
     <div className="vp-calendar-entry-top">
      <div><span className="vp-calendar-day">{localLabel(draft.local_date,draft.local_time)}</span>
       <h3>{draft.title}</h3><small>{project?.mode==="podcast"?"Full episode":"Short"} · {project?.status||"Project unavailable"}</small></div>
      <span data-state={draft.status} className="vp-calendar-state">{draft.status}</span>
     </div>
     {editing?<details className="vp-calendar-edit"><summary>Edit metadata, artwork and playlist</summary>
      <div className="vp-calendar-fields">
       <label>Title<input value={current.title} onChange={e=>patch(draft.id,{title:e.target.value})}/></label>
       <label>Date<input type="date" value={current.local_date} onChange={e=>patch(draft.id,{local_date:e.target.value})}/></label>
       <label>Time, New York<input type="time" value={current.local_time} onChange={e=>patch(draft.id,{local_time:e.target.value})}/></label>
       <label>Playlist ID<input value={current.playlist_id||""} onChange={e=>patch(draft.id,{playlist_id:e.target.value})}/></label>
       <label>Generated thumbnail<select value={current.thumbnail_variant||""}
        onChange={e=>patch(draft.id,{thumbnail_variant:(e.target.value||null) as "A"|"B"|null})}>
        <option value="">No generated thumbnail</option><option value="A">Variant A</option><option value="B">Variant B</option>
       </select></label>
       <label>Custom thumbnail<input type="file" accept="image/png,image/jpeg,image/webp"
        disabled={Boolean(busy)} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadCustomThumbnail(draft.id,file)}}/></label>
      </div>
      <label className="vp-calendar-description">YouTube description<textarea rows={4} value={current.description} onChange={e=>patch(draft.id,{description:e.target.value})}/></label>
      <button disabled={Boolean(busy)} onClick={()=>void action("Draft update",async()=>{
       await json("/api/admin/video-producer/schedule",{method:"PATCH",body:JSON.stringify({
        id:draft.id,localDate:current.local_date,localTime:current.local_time,title:current.title,
        description:current.description,playlistId:current.playlist_id,thumbnailVariant:current.thumbnail_variant
       })});setEdits(prev=>({...prev,[draft.id]:{}}));
      })}>Save draft</button>
     </details>:null}
     {draft.error_message?<p className="vp-calendar-alert">{draft.error_message}</p>:null}
     <div className="vp-calendar-entry-actions">
      {project?<Link href={`/admin/video-producer/${project.id}/deliver`}>Open finished video</Link>:null}
      {draft.youtube_video_id?<a href={`https://www.youtube.com/watch?v=${encodeURIComponent(draft.youtube_video_id)}`} target="_blank" rel="noreferrer"><ExternalLink size={14}/> YouTube Studio video</a>:null}
      {editing?<button disabled={!ready||Boolean(busy)} onClick={()=>void action("YouTube schedule submission",async()=>{
       if(!window.confirm(`Submit "${current.title}" to ${draft.channel_handle} for ${localLabel(draft.local_date,draft.local_time)}? This is the final action that uploads to YouTube.`))return;
       if(Object.keys(edits[draft.id]||{}).length)throw new Error("Save metadata changes before submitting.");
       await json(`/api/admin/video-producer/schedule/${draft.id}/submit`,{method:"POST",body:JSON.stringify({confirm:true})});
      })}>{busy?<Loader2 size={15}/>:<Upload size={15}/>} Send to YouTube schedule</button>:null}
      {editing?<button className="vp-calendar-neutral" disabled={Boolean(busy)} onClick={()=>void action("Draft cancellation",async()=>{
       if(!window.confirm("Cancel this calendar draft?"))return;
       await json(`/api/admin/video-producer/schedule?id=${draft.id}`,{method:"DELETE"});
      })}>Cancel draft</button>:null}
      {draft.status==="submitted"?<span className="vp-calendar-ok"><CheckCircle2 size={15}/> Submitted to YouTube</span>:null}
     </div>
     {editing&&!ready?<p className="vp-calendar-quiet">Render and review the final approved master before submission.</p>:null}
    </article>;
   })}
   {!drafts.length?<div className="vp-calendar-empty">No release drafts. Select projects above to build the daily calendar.</div>:null}
   </div>
  </section>
 </main>;
}

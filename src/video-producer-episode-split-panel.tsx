"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";

type Item={title:string;start:number;end:number;shortStart?:number;shortEnd?:number};
type Child={id:string;title:string;status:string;source_range_start:number;source_range_end:number};
type Episode=Child&{shorts:Child[]};

const toClock=(raw:number)=>`${Math.floor(raw/60)}:${String(Math.round(raw%60)).padStart(2,"0")}`;
async function json<T>(url:string,init?:RequestInit):Promise<T>{
 const res=await fetch(url,{...init,headers:{"content-type":"application/json",...(init?.headers||{})},cache:"no-store"});
 const data=await res.json().catch(()=>({})) as T & {error?:string};
 if(!res.ok)throw new Error(data.error||"Could not load episode groups.");
 return data;
}
/** Source-linked child drafts. Neither split nor reload approves or publishes. */
export function VideoProducerEpisodeSplitPanel({projectId,duration}:{projectId:string;duration:number}){
 const [episodes,setEpisodes]=useState<Episode[]>([]);
 const [draft,setDraft]=useState<Item[]>([{title:"Episode 1",start:0,end:Math.min(duration,360)}]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  const data=await json<{episodes:Episode[]}>(`/api/admin/video-producer/split-episodes?projectId=${encodeURIComponent(projectId)}`);
  setEpisodes(data.episodes||[]);
 },[projectId]);
 useEffect(()=>{
  let active=true;
  void fetch(`/api/admin/video-producer/split-episodes?projectId=${encodeURIComponent(projectId)}`,{cache:"no-store"})
   .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load episodes");return data;})
   .then(value=>{if(active)setEpisodes(value.episodes||[]);})
   .catch(error=>{if(active)setError(error instanceof Error?error.message:"Could not load episodes");});
  return ()=>{active=false;};
 },[projectId]);
 function change(index:number,patch:Partial<Item>){setDraft(rows=>rows.map((row,i)=>i===index?{...row,...patch}:row));}
 async function split(){
  setBusy(true);setError("");setNotice("");
  try{
   if(!window.confirm("Create named episode drafts and one matching Short for each? All use the original private recording."))return;
   const result=await json<{created:unknown[]}>("/api/admin/video-producer/split-episodes",{
    method:"POST",body:JSON.stringify({projectId,episodes:draft.map(row=>({...row,shortStart:row.shortStart??row.start,shortEnd:row.shortEnd??Math.min(row.end,row.start+40)}))})
   });
   setNotice(`${result.created.length} episode and Short pairs created. Review each draft independently before approval.`);
   setDraft([{title:"New episode",start:0,end:Math.min(duration,360)}]);
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Could not create episodes");}
  finally{setBusy(false);}
 }
 return <section aria-label="Episodes from source recording" style={{border:"1px solid #67727a",borderRadius:12,padding:16,display:"grid",gap:12}}>
  <h3>Episodes and Shorts from this source</h3>
  <p>Define any number of named episode sections. Each section makes an independent podcast draft and a matching 9:16 Short between 12 and 60 seconds. The original recording is not duplicated or modified.</p>
  {episodes.length?<div style={{display:"grid",gap:8}}>
   {episodes.map(episode=><div key={episode.id} style={{padding:10,border:"1px solid #62737b",borderRadius:8,display:"grid",gap:5}}>
    <Link href={`/admin/video-producer/${episode.id}/source`}><strong>{episode.title}</strong> · {toClock(episode.source_range_start)} to {toClock(episode.source_range_end)}</Link>
    {episode.shorts.map(short=><Link key={short.id} href={`/admin/video-producer/${short.id}/source`}>Matching Short · {toClock(short.source_range_start)} to {toClock(short.source_range_end)} · {short.status}</Link>)}
   </div>)}
  </div>:<p>No mini episodes created yet.</p>}
  <h4>Split new sections</h4>
  {draft.map((row,i)=><div key={i} style={{border:"1px solid #62737b",borderRadius:8,padding:10,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10}}>
    <label style={{gridColumn:"1/-1"}}>Episode name<input style={{width:"100%"}} value={row.title} disabled={busy} onChange={e=>change(i,{title:e.target.value})}/></label>
    <label>Start (sec)<input type="number" min={0} max={duration} step={.1} value={row.start} disabled={busy} onChange={e=>change(i,{start:Number(e.target.value)})}/></label>
    <label>End (sec)<input type="number" min={0} max={duration} step={.1} value={row.end} disabled={busy} onChange={e=>change(i,{end:Number(e.target.value)})}/></label>
    <label>Short start<input type="number" min={0} max={duration} step={.1} placeholder="Episode start" value={row.shortStart??""} disabled={busy} onChange={e=>change(i,{shortStart:e.target.value?Number(e.target.value):undefined})}/></label>
    <label>Short end<input type="number" min={0} max={duration} step={.1} placeholder="First 40 sec" value={row.shortEnd??""} disabled={busy} onChange={e=>change(i,{shortEnd:e.target.value?Number(e.target.value):undefined})}/></label>
    <button type="button" disabled={busy||draft.length===1} onClick={()=>setDraft(v=>v.filter((_,j)=>i!==j))}>Remove section</button>
  </div>)}
  <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
   <button type="button" disabled={busy||draft.length>=24} onClick={()=>setDraft(rows=>[...rows,{title:`Episode ${rows.length+1}`,start:Math.min(duration,rows.at(-1)?.end||0),end:Math.min(duration,(rows.at(-1)?.end||0)+360)}])}>Add section</button>
   <button type="button" disabled={busy||!duration||!draft.length} onClick={()=>void split()}>{busy?"Creating drafts…":"Create episodes and Shorts"}</button>
  </div>
  {error?<p role="alert">{error}</p>:null}
  {notice?<p role="status">{notice}</p>:null}
 </section>;
}

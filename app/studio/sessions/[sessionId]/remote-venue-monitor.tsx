"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeStudioRoom, type LiveKitConnection } from "@/studio/livekit-client";

type Venue={id:string;display_name:string;state:string;media_state?:string;is_remote_venue?:boolean};
type Media={url:string;token:string};
export default function RemoteVenueMonitor({episodeId,sessionId}:{episodeId:string;sessionId:string}){
  const[venues,setVenues]=useState<Venue[]>([]);
  const[status,setStatus]=useState<"off"|"connecting"|"listening"|"failed">("off");
  const[error,setError]=useState("");
  const room=useRef<LiveKitConnection|null>(null);
  const audio=useRef(new Map<string,HTMLMediaElement>());
  const venueIds=useRef(new Set<string>());
  const starting=useRef(false);

  useEffect(()=>{
    let alive=true;
    async function poll(){
      try{
        const r=await fetch(`/api/studio/episodes/${episodeId}/guests`,{cache:"no-store"});
        if(!r.ok)return;
        const p=await r.json();
        const next:Venue[]=(Array.isArray(p.guests)?p.guests:[]).filter((v:Venue)=>v.is_remote_venue);
        if(alive){setVenues(next);venueIds.current=new Set(next.map(v=>`guest-${v.id}`));}
      }catch{}
    }
    void poll();const interval=setInterval(()=>void poll(),5000);
    return()=>{alive=false;clearInterval(interval);room.current?.disconnect();audio.current.forEach(el=>el.remove());audio.current.clear();};
  },[episodeId]);

  function stop(){
    room.current?.disconnect();room.current=null;
    audio.current.forEach(el=>el.remove());audio.current.clear();
    setStatus("off");
  }
  async function start(){
    if(starting.current||status==="listening")return;
    starting.current=true;setStatus("connecting");setError("");
    try{
      const r=await fetch(`/api/studio/sessions/${sessionId}/room-media?mode=subscribe`,{cache:"no-store"});
      if(!r.ok)throw Error("Producer cannot request a monitor feed");
      const p=await r.json() as {media?:Media;configured?:boolean};
      if(!p.media)throw Error("LiveKit is not configured in this environment");
      const connected=await subscribeStudioRoom(p.media,{
        onVideo:()=>{},
        onAudio:(identity,element)=>{
          if(!venueIds.current.has(identity)||audio.current.has(identity))return;
          element.autoplay=true;element.style.display="none";
          document.body.appendChild(element);audio.current.set(identity,element);
          void element.play().catch(()=>{setError("Browser blocked audio. Check your system audio settings.");});
        },
        onRemove:identity=>{
          audio.current.get(identity)?.remove();audio.current.delete(identity);
        }
      });
      room.current=connected;setStatus("listening");
    }catch(e){stop();setStatus("failed");setError(e instanceof Error?e.message:"Unable to monitor the venue");}
    finally{starting.current=false;}
  }
  return <section className="ag-studio-panel" style={{margin:"12px 20px 22px",padding:"18px"}}>
    <header><div><span className="ag-studio-eyebrow">International connection</span><h2>Remote venues</h2></div>
      <span className="ag-studio-muted">{venues.filter(v=>v.media_state==="connected").length}/{venues.length} feeds connected</span></header>
    {venues.length?venues.map(v=><div key={v.id} style={{display:"flex",gap:12,alignItems:"center",justifyContent:"space-between",padding:"8px 0"}}>
      <strong>{v.display_name}</strong><span>{v.media_state??"offline"} · {v.state}</span>
    </div>):<p className="ag-studio-muted">No remote venues invited. Create a venue link from the episode Guests panel.</p>}
    <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginTop:12}}>
      {status!=="listening"?<button disabled={!venues.length||status==="connecting"} onClick={()=>void start()}>
        {status==="connecting"?"CONNECTING…":"MONITOR RETURN AUDIO (HEADPHONES)"}</button>:
      <button onClick={stop}>STOP RETURN MONITOR</button>}
      <span className="ag-studio-muted">Local speaker monitoring is disabled by default to prevent feedback.</span>
    </div>
    {error?<p role="alert" className="ag-studio-error">{error}</p>:null}
  </section>;
}

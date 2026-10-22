"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { publishGuestStream, type LiveKitConnection } from "@/studio/livekit-client";

type Media={url:string;token:string;room:string;identity:string};
type Config={venueName:string;sessionId:string|null;liveKitConfigured:boolean;media:Media|null;programUrl:string|null};
type Input={id:string;label:string};
type VenueStatus="offline"|"connecting"|"connected"|"reconnecting"|"failed";
const statusLabel:Record<VenueStatus,string>={
  offline:"OFFLINE",connecting:"CONNECTING",connected:"RETURN FEED LIVE",
  reconnecting:"RECONNECTING",failed:"CONNECTION FAILED"
};

export default function VenueConsole({token,venueName}:{token:string;venueName:string}) {
  const [config,setConfig]=useState<Config|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [status,setStatus]=useState<VenueStatus>("offline");
  const [incomingOpen,setIncomingOpen]=useState(false);
  const [incomingMuted,setIncomingMuted]=useState(false);
  const [audioInputs,setAudioInputs]=useState<Input[]>([]);
  const [videoInputs,setVideoInputs]=useState<Input[]>([]);
  const [audioId,setAudioId]=useState("");
  const [videoId,setVideoId]=useState("");
  const [latency,setLatency]=useState<number|null>(null);
  const [micLevel,setMicLevel]=useState(0);
  const [micMuted,setMicMuted]=useState(false);
  const [cameraOff,setCameraOff]=useState(false);
  const [confirmedHeadphones,setConfirmedHeadphones]=useState(false);
  const preview=useRef<HTMLVideoElement>(null);
  const programScreen=useRef<HTMLDivElement>(null);
  const sessionSeen=useRef<string|null>(null);
  const meter=useRef<{context:AudioContext;frame:number}|null>(null);
  const connection=useRef<LiveKitConnection|null>(null);
  const stream=useRef<MediaStream|null>(null);
  const joining=useRef(false);
  const active=useRef(false);
  const latest=useRef<Config|null>(null);

  const stopMeter=()=>{
    if(meter.current){cancelAnimationFrame(meter.current.frame);void meter.current.context.close();meter.current=null;}
    setMicLevel(0);
  };
  const startMeter=(media:MediaStream)=>{
    stopMeter();
    const track=media.getAudioTracks()[0];if(!track)return;
    const context=new AudioContext(),source=context.createMediaStreamSource(new MediaStream([track]));
    const analyser=context.createAnalyser();analyser.fftSize=256;source.connect(analyser);
    const samples=new Uint8Array(analyser.fftSize);
    meter.current={context,frame:0};
    const check=()=>{
      if(!meter.current||meter.current.context!==context)return;
      analyser.getByteTimeDomainData(samples);
      let sum=0;for(const x of samples){const value=(x-128)/128;sum+=value*value;}
      setMicLevel(Math.min(100,Math.round(Math.sqrt(sum/samples.length)*420)));
      meter.current.frame=requestAnimationFrame(check);
    };
    void context.resume().then(check).catch(()=>{});
  };
  const report=useCallback((state:VenueStatus)=>{
    void fetch(`/api/venue/${encodeURIComponent(token)}`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({type:"media",state}),cache:"no-store"
    }).catch(()=>{});
  },[token]);

  const load=useCallback(async()=>{
    const start=performance.now();
    const response=await fetch(`/api/venue/${encodeURIComponent(token)}`,{cache:"no-store"});
    if(!response.ok)throw new Error(response.status===404?"Venue invitation has expired or been revoked":"Cannot retrieve session configuration");
    const next=await response.json() as Config;
    latest.current=next;
    if(sessionSeen.current&&sessionSeen.current!==next.sessionId){
      active.current=false;
      connection.current?.disconnect();connection.current=null;
      stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
      if(meter.current){cancelAnimationFrame(meter.current.frame);void meter.current.context.close();meter.current=null;}
      setMicLevel(0);setStatus("offline");setIncomingOpen(false);
      setError("Miami started a new session. Reconnect the camera and reopen the program.");
    }
    sessionSeen.current=next.sessionId;
    setLatency(Math.round(performance.now()-start));
    setConfig(prev=>prev?.sessionId===next.sessionId&&prev.liveKitConfigured===next.liveKitConfigured?prev:next);
    setLoading(false);
    return next;
  },[token]);

  useEffect(()=>{
    let cancelled=false;
    const check=()=>load().catch(e=>{if(!cancelled){
      if(String(e).includes("revoked")){
        active.current=false;connection.current?.disconnect();connection.current=null;
        stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
        setStatus("offline");setIncomingOpen(false);setConfig(null);
        if(meter.current){cancelAnimationFrame(meter.current.frame);void meter.current.context.close();meter.current=null;}
      }
      setError(e instanceof Error?e.message:"Connection check failed");setLoading(false);
    }});
    void check();
    const timer=setInterval(()=>void check(),7000);
    return()=>{cancelled=true;clearInterval(timer);active.current=false;connection.current?.disconnect();stream.current?.getTracks().forEach(t=>t.stop());if(meter.current){cancelAnimationFrame(meter.current.frame);void meter.current.context.close();meter.current=null;}};
  },[load]);

  async function devices(){
    const list=await navigator.mediaDevices.enumerateDevices();
    setAudioInputs(list.filter(x=>x.kind==="audioinput").map((x,i)=>({id:x.deviceId,label:x.label||`Microphone ${i+1}`})));
    setVideoInputs(list.filter(x=>x.kind==="videoinput").map((x,i)=>({id:x.deviceId,label:x.label||`Camera ${i+1}`})));
  }
  async function disconnect(){
    active.current=false;
    connection.current?.disconnect();connection.current=null;
    stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;stopMeter();
    if(preview.current)preview.current.srcObject=null;
    setStatus("offline");setMicMuted(false);setCameraOff(false);report("offline");
    void fetch(`/api/venue/${encodeURIComponent(token)}`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({type:"state",state:"disconnected"})
    }).catch(()=>{});
  }
  async function startReturn(){
    if(joining.current||status==="connected")return;
    joining.current=true;setError("");setStatus("connecting");report("connecting");
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera/microphone requires HTTPS and a compatible browser.");
      const next=await load();
      if(!next.media||!next.sessionId)throw new Error("No active studio session. Ask Miami to start a broadcast session first.");
      const capture=await navigator.mediaDevices.getUserMedia({
        video:videoId?{deviceId:{exact:videoId},width:{ideal:1280},height:{ideal:720}}:{width:{ideal:1280},height:{ideal:720}},
        audio:audioId?{deviceId:{exact:audioId},echoCancellation:true,noiseSuppression:true,autoGainControl:true}:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}
      });
      stream.current=capture;
      setMicMuted(false);setCameraOff(false);
      startMeter(capture);
      if(preview.current){preview.current.srcObject=capture;void preview.current.play().catch(()=>{});}
      active.current=true;
      await devices();
      void fetch(`/api/venue/${encodeURIComponent(token)}`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({type:"state",state:"green_room"})
      }).catch(()=>{});
      const joined=await publishGuestStream(next.media,capture,s=>{
        if(!active.current)return;
        const mapped:VenueStatus=s==="connected"?"connected":s==="reconnecting"?"reconnecting":s==="connecting"?"connecting":"failed";
        setStatus(mapped);report(mapped);
      });
      if(!active.current)joined.disconnect();else connection.current=joined;
    }catch(e){
      active.current=false;
      stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;stopMeter();
      setStatus("failed");report("failed");
      setError(e instanceof Error?e.message:"Unable to connect the venue");
    }finally{joining.current=false;}
  }
  function toggleTrack(kind:"audio"|"video"){
    const target=kind==="audio"?stream.current?.getAudioTracks():stream.current?.getVideoTracks();
    if(!target?.length)return;
    if(kind==="audio"){const next=!micMuted;target.forEach(t=>t.enabled=!next);setMicMuted(next);}
    else{const next=!cameraOff;target.forEach(t=>t.enabled=!next);setCameraOff(next);}
  }
  const canStart=Boolean(config?.sessionId&&config?.liveKitConfigured&&!loading);
  const program=config?.programUrl?config.programUrl+(incomingMuted?"&mute=1":""):null;

  return <main className="ag-venue">
    <header className="ag-venue-header">
      <div><small>APOSTOLIC GUIDE · REMOTE VENUE</small><h1>{venueName}</h1><p>Two-way church connection and technical control</p></div>
      <span className={status==="connected"?"ag-venue-pill live":"ag-venue-pill"}>{statusLabel[status]}</span>
    </header>
    <section className="ag-venue-grid">
      <div className="ag-venue-card">
        <div className="ag-venue-card-title"><h2>Miami program</h2><span>{config?.sessionId?"SESSION AVAILABLE":"WAITING FOR SESSION"}</span></div>
        <div className="ag-venue-screen" ref={programScreen}>
          {incomingOpen&&program?<iframe key={program} src={program} title="Miami live program"
            allow="autoplay; fullscreen" allowFullScreen referrerPolicy="no-referrer"/>:
          <div className="ag-venue-placeholder"><strong>Receiving screen</strong><p>Open the program after Miami starts the producer session and OBS output.</p></div>}
        </div>
        <div className="ag-venue-actions">
          <button onClick={()=>setIncomingOpen(v=>!v)} disabled={!program}>{incomingOpen?"CLOSE PROGRAM":"OPEN INCOMING PROGRAM"}</button>
          <button className="secondary" disabled={!incomingOpen} onClick={()=>void programScreen.current?.requestFullscreen?.().catch(()=>setError("Unable to enter fullscreen. Try the browser fullscreen control."))}>FULLSCREEN FOR PROJECTOR</button>
          <label><input type="checkbox" checked={incomingMuted} onChange={e=>setIncomingMuted(e.target.checked)}/> Mute incoming audio</label>
        </div>
        <p className="ag-venue-note">This is the composed Studio scene with Scriptures and graphics. Incoming audio must feed your PA without returning to Miami's microphone.</p>
      </div>
      <div className="ag-venue-card">
        <div className="ag-venue-card-title"><h2>Kenya return feed</h2><span>{statusLabel[status]}</span></div>
        <div className="ag-venue-screen local"><video ref={preview} autoPlay muted playsInline/><span>LOCAL CAMERA PREVIEW</span></div>
        <div className="ag-venue-meter" aria-label="Microphone input level">
          <span>INTERPRETER MIC</span><div><i style={{width:`${micLevel}%`}}/></div><b>{micLevel>8?"SIGNAL":"QUIET"}</b>
        </div>
        <div className="ag-venue-inputs">
          <label>Camera<select value={videoId} onChange={e=>setVideoId(e.target.value)}><option value="">System default</option>{videoInputs.map(x=><option value={x.id} key={x.id}>{x.label}</option>)}</select></label>
          <label>Microphone / interpreter<select value={audioId} onChange={e=>setAudioId(e.target.value)}><option value="">System default</option>{audioInputs.map(x=><option value={x.id} key={x.id}>{x.label}</option>)}</select></label>
        </div>
        <label className="ag-venue-safety"><input type="checkbox" checked={confirmedHeadphones} onChange={e=>setConfirmedHeadphones(e.target.checked)}/>
          Our audio mixer has a mix-minus feed, or we are testing with headphones to prevent echo.</label>
        <div className="ag-venue-actions">
          <button onClick={()=>void startReturn()} disabled={!canStart||!confirmedHeadphones||status==="connected"||status==="connecting"}>CONNECT CAMERA + MICROPHONE</button>
          <button className="secondary" disabled={!stream.current} onClick={()=>toggleTrack("audio")}>{micMuted?"UNMUTE MIC":"MUTE MIC"}</button>
          <button className="secondary" disabled={!stream.current} onClick={()=>toggleTrack("video")}>{cameraOff?"START CAMERA":"STOP CAMERA"}</button>
          <button className="secondary" onClick={()=>void disconnect()} disabled={status==="offline"}>DISCONNECT</button>
        </div>
        <p className="ag-venue-note">Selected input changes apply on the next connection. Use separate audio outputs and a mix-minus for a live PA system.</p>
      </div>
    </section>
    <section className="ag-venue-footer">
      <div><strong>Connection check</strong><span>API round trip: {latency===null?"not tested":`${latency} ms`} · LiveKit: {config?.liveKitConfigured?"configured":"not configured"} · Return: {statusLabel[status]}</span></div>
      <button onClick={()=>void load().catch(e=>setError(e instanceof Error?e.message:"Check failed"))}>REFRESH SESSION</button>
    </section>
    {error?<div className="ag-venue-error" role="alert">{error}</div>:null}
    {loading?<p className="ag-venue-note">Loading venue configuration…</p>:null}
    <p className="ag-venue-privacy">Private invitation. Only the Miami producer can put this return feed on the program. Keep this link within your local technical team.</p>
  </main>;
}

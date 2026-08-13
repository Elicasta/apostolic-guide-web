"use client";
import { useState } from "react";
import { CalendarDays, Loader2, PenLine, ShieldCheck, Sparkles } from "lucide-react";

export function ThreadsSingleComposer(){
  const [mode,setMode]=useState<"generate"|"manual">("generate");
  const [prompt,setPrompt]=useState("");
  const [body,setBody]=useState("");
  const [status,setStatus]=useState<"pass"|"warning"|"blocked">();
  const [notes,setNotes]=useState("");
  const [scheduledFor,setScheduledFor]=useState("");
  const [busy,setBusy]=useState<string>();
  const [message,setMessage]=useState("Generate one post or write it manually, review it, then add it to the calendar.");

  async function generate(){
    if(!prompt.trim()) return setMessage("Add a direction for the post first.");
    setBusy("generate");
    try{
      const today=new Date().toISOString().slice(0,10);
      const r=await fetch("/api/admin/threads-studio/generate-week",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({weekStart:today,topic:prompt.trim(),count:3})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Generation failed.");
      const first=d.posts?.[0]||d.plan?.posts?.[0];
      if(!first?.body) throw new Error("No post was generated.");
      setBody(first.body);setStatus(undefined);setNotes("");setMessage("One post drafted. Edit it if needed, then run Review.");
    }catch(e){setMessage(e instanceof Error?e.message:"Generation failed.");}finally{setBusy(undefined);}
  }

  async function review(){
    if(!body.trim()) return setMessage("Write or generate the post first.");
    setBusy("review");
    try{
      const r=await fetch("/api/admin/threads-studio/check",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({posts:[{body:body.trim(),category:"response"}]})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Review failed.");
      const item=d.review?.posts?.[0];setStatus(item?.status);setNotes(item?.notes||d.review?.summary||"");setMessage(d.review?.summary||"Review complete.");
    }catch(e){setMessage(e instanceof Error?e.message:"Review failed.");}finally{setBusy(undefined);}
  }

  async function queue(){
    if(!body.trim()) return setMessage("Write the post first.");
    if(!status) return setMessage("Run Review before scheduling.");
    if(status==="blocked") return setMessage("This post needs revision before scheduling.");
    if(!scheduledFor) return setMessage("Choose a schedule time.");
    setBusy("queue");
    try{
      const when=new Date(scheduledFor);
      const r=await fetch("/api/admin/threads-studio/queue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({allowWarnings:status==="warning",items:[{body:body.trim(),category:"response",scheduledFor:when.toISOString(),doctrineStatus:status,mirrorToX:false}]})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Schedule failed.");
      setMessage("Post added to the publishing calendar.");
    }catch(e){setMessage(e instanceof Error?e.message:"Schedule failed.");}finally{setBusy(undefined);}
  }

  return <div className="threads-panel threads-single-composer">
    <div className="threads-panel-title"><div><strong>Single Thread</strong><span>Generate one or write it manually.</span></div><PenLine size={18}/></div>
    <div className="threads-mode-switch"><button type="button" className={mode==="generate"?"is-active":""} onClick={()=>setMode("generate")}><Sparkles size={14}/> Generate one</button><button type="button" className={mode==="manual"?"is-active":""} onClick={()=>setMode("manual")}><PenLine size={14}/> Write manually</button></div>
    {mode==="generate"?<><label><span>Direction</span><textarea rows={3} value={prompt} placeholder="What should this one post say or explore?" onChange={e=>setPrompt(e.target.value)}/></label><button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={()=>void generate()}>{busy==="generate"?<Loader2 className="spin" size={15}/>:<Sparkles size={15}/>} Generate one</button></>:null}
    <label><span>Post</span><textarea rows={7} maxLength={500} placeholder="Write the post exactly how you want it to publish…" value={body} onChange={e=>{setBody(e.target.value);setStatus(undefined);setNotes("");}}/><small className="threads-char-count">{body.length} / 500</small></label>
    <div className="threads-review-actions"><button className="button" type="button" disabled={Boolean(busy)||!body.trim()} onClick={()=>void review()}>{busy==="review"?<Loader2 className="spin" size={15}/>:<ShieldCheck size={15}/>} Review</button>{status?<span className={`threads-doctrine-badge is-${status}`}>{status}</span>:null}</div>
    {notes?<p className="threads-doctrine-note">{notes}</p>:null}
    <label><span>Schedule</span><input type="datetime-local" value={scheduledFor} onChange={e=>setScheduledFor(e.target.value)}/></label>
    <button className="button button-primary" type="button" disabled={Boolean(busy)||!body.trim()} onClick={()=>void queue()}>{busy==="queue"?<Loader2 className="spin" size={15}/>:<CalendarDays size={15}/>} Add to calendar</button>
    <p className="threads-status">{message}</p>
  </div>;
}

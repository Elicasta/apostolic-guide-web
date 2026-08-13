"use client";
import { useState } from "react";
import { CalendarDays, PenLine } from "lucide-react";

export function ThreadsSingleComposer(){
  const [body,setBody]=useState("");
  const [scheduledFor,setScheduledFor]=useState("");
  const [message,setMessage]=useState("Write one post and add it to the calendar.");
  async function queue(){
    if(!body.trim()) return setMessage("Write the post first.");
    if(!scheduledFor) return setMessage("Choose a schedule time.");
    const when=new Date(scheduledFor);
    const r=await fetch("/api/admin/threads-studio/queue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({items:[{body:body.trim(),category:"response",scheduledFor:when.toISOString(),mirrorToX:false}]})});
    const d=await r.json();
    if(!r.ok) return setMessage(d.error||"Schedule failed.");
    setMessage("Post added to the publishing calendar.");
  }
  return <div className="threads-panel threads-single-composer">
    <div className="threads-panel-title"><div><strong>Single Thread</strong><span>Manual one-post creator.</span></div><PenLine size={18}/></div>
    <label><span>Post</span><textarea rows={7} maxLength={500} placeholder="Write the post exactly how you want it to publish…" value={body} onChange={e=>setBody(e.target.value)}/><small className="threads-char-count">{body.length} / 500</small></label>
    <label><span>Schedule</span><input type="datetime-local" value={scheduledFor} onChange={e=>setScheduledFor(e.target.value)}/></label>
    <button className="button button-primary" type="button" onClick={()=>void queue()}><CalendarDays size={15}/> Add to calendar</button>
    <p className="threads-status">{message}</p>
  </div>;
}

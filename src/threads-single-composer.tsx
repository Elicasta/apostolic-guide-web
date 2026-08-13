"use client";
import { useState } from "react";
import { CalendarDays, ExternalLink, Loader2, PenLine, Send, ShieldCheck, Sparkles } from "lucide-react";

type Category="oneness"|"scripture"|"witty"|"question"|"app"|"response";

export function ThreadsSingleComposer(){
  const [mode,setMode]=useState<"generate"|"manual">("generate");
  const [prompt,setPrompt]=useState("");
  const [body,setBody]=useState("");
  const [category,setCategory]=useState<Category>("oneness");
  const [status,setStatus]=useState<"pass"|"warning"|"blocked">();
  const [notes,setNotes]=useState("");
  const [scheduledFor,setScheduledFor]=useState("");
  const [busy,setBusy]=useState<string>();
  const [publishedUrl,setPublishedUrl]=useState<string>();
  const [message,setMessage]=useState("Generate one post or write it manually, review it, then publish now or schedule it.");

  async function generate(){
    if(!prompt.trim()) return setMessage("Add a direction for the post first.");
    setBusy("generate");
    try{
      const r=await fetch("/api/admin/threads-studio/generate-one",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({direction:prompt.trim()})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Generation failed.");
      if(!d.post?.body) throw new Error("No post was generated.");
      setBody(d.post.body);setCategory(d.post.category||"oneness");setStatus(undefined);setNotes("");setPublishedUrl(undefined);setMessage("One post drafted. Edit it if needed, then run Theology check.");
    }catch(e){setMessage(e instanceof Error?e.message:"Generation failed.");}finally{setBusy(undefined);}
  }

  async function review(){
    if(!body.trim()) return setMessage("Write or generate the post first.");
    setBusy("review");
    try{
      const r=await fetch("/api/admin/threads-studio/check",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({posts:[{body:body.trim(),category}]})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Review failed.");
      const item=d.review?.posts?.[0];setStatus(item?.status);setNotes(item?.notes||d.review?.summary||"");setMessage(d.review?.summary||"Review complete.");
    }catch(e){setMessage(e instanceof Error?e.message:"Review failed.");}finally{setBusy(undefined);}
  }

  function ready(){
    if(!body.trim()){setMessage("Write or generate the post first.");return false;}
    if(!status){setMessage("Run Theology check first.");return false;}
    if(status==="blocked"){setMessage("This post needs revision before publishing.");return false;}
    return true;
  }

  async function publish(){
    if(!ready()) return;
    setBusy("publish");setPublishedUrl(undefined);
    try{
      const r=await fetch("/api/admin/threads-studio/publish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({body:body.trim(),category,doctrineStatus:status})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Publish failed.");
      setPublishedUrl(d.permalink||undefined);setMessage("Published to Threads.");
    }catch(e){setMessage(e instanceof Error?e.message:"Publish failed.");}finally{setBusy(undefined);}
  }

  async function queue(){
    if(!ready()) return;
    if(!scheduledFor) return setMessage("Choose a schedule time.");
    setBusy("queue");
    try{
      const when=new Date(scheduledFor);
      const r=await fetch("/api/admin/threads-studio/queue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({allowWarnings:status==="warning",items:[{body:body.trim(),category,scheduledFor:when.toISOString(),doctrineStatus:status,mirrorToX:false}]})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Schedule failed.");
      setMessage("Post added to the publishing calendar. It will publish automatically when due once Threads is connected.");
    }catch(e){setMessage(e instanceof Error?e.message:"Schedule failed.");}finally{setBusy(undefined);}
  }

  return <div className="threads-panel threads-single-composer">
    <div className="threads-panel-title"><div><strong>Single Thread</strong><span>Generate one or write it manually.</span></div><PenLine size={18}/></div>
    <div className="threads-mode-switch"><button type="button" className={mode==="generate"?"is-active":""} onClick={()=>setMode("generate")}><Sparkles size={14}/> Generate one</button><button type="button" className={mode==="manual"?"is-active":""} onClick={()=>setMode("manual")}><PenLine size={14}/> Write manually</button></div>
    {mode==="generate"?<><label><span>Direction</span><textarea rows={3} value={prompt} placeholder="Example: A serious but witty thought about Deuteronomy 6:4 and how plainly Scripture says God is one." onChange={e=>setPrompt(e.target.value)}/></label><button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={()=>void generate()}>{busy==="generate"?<Loader2 className="spin" size={15}/>:<Sparkles size={15}/>} Generate one</button></>:null}
    <label><span>Type</span><select value={category} onChange={e=>{setCategory(e.target.value as Category);setStatus(undefined);}}><option value="oneness">Oneness theology</option><option value="scripture">Scripture observation</option><option value="witty">Serious + witty</option><option value="question">Question</option><option value="app">Apostolic Guide</option><option value="response">General response</option></select></label>
    <label><span>Post</span><textarea rows={7} maxLength={500} placeholder="Write the post exactly how you want it to publish…" value={body} onChange={e=>{setBody(e.target.value);setStatus(undefined);setNotes("");setPublishedUrl(undefined);}}/><small className="threads-char-count">{body.length} / 500</small></label>
    <div className="threads-review-actions"><button className="button" type="button" disabled={Boolean(busy)||!body.trim()} onClick={()=>void review()}>{busy==="review"?<Loader2 className="spin" size={15}/>:<ShieldCheck size={15}/>} Theology check</button>{status?<span className={`threads-doctrine-badge is-${status}`}>{status}</span>:null}</div>
    {notes?<p className="threads-doctrine-note">{notes}</p>:null}
    <div className="threads-single-actions"><button className="button button-primary" type="button" disabled={Boolean(busy)||!body.trim()} onClick={()=>void publish()}>{busy==="publish"?<Loader2 className="spin" size={15}/>:<Send size={15}/>} Publish now</button>{publishedUrl?<a className="button" href={publishedUrl} target="_blank" rel="noreferrer">Open post <ExternalLink size={14}/></a>:null}</div>
    <div className="threads-schedule-box"><label><span>Or schedule</span><input type="datetime-local" value={scheduledFor} onChange={e=>setScheduledFor(e.target.value)}/></label><button className="button" type="button" disabled={Boolean(busy)||!body.trim()} onClick={()=>void queue()}>{busy==="queue"?<Loader2 className="spin" size={15}/>:<CalendarDays size={15}/>} Add to calendar</button></div>
    <p className="threads-status">{message}</p>
  </div>;
}

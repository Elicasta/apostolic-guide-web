"use client";
import { useState } from "react";
import { Loader2, PenLine, Send, ShieldCheck, Sparkles } from "lucide-react";

type Category="oneness"|"scripture"|"witty"|"question"|"app"|"response";

export function ThreadsSingleComposer(){
  const [mode,setMode]=useState<"generate"|"manual">("generate");
  const [prompt,setPrompt]=useState("");
  const [body,setBody]=useState("");
  const [category,setCategory]=useState<Category>("oneness");
  const [status,setStatus]=useState<"pass"|"warning"|"blocked">();
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState<string>();
  const [message,setMessage]=useState("Generate one post or write it manually, run Theology check, then send the approved draft to Publishing.");

  async function generate(){
    if(!prompt.trim()) return setMessage("Add a direction for the post first.");
    setBusy("generate");
    try{
      const r=await fetch("/api/admin/threads-studio/generate-one",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({direction:prompt.trim()})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Generation failed.");
      if(!d.post?.body) throw new Error("No post was generated.");
      setBody(d.post.body);setCategory(d.post.category||"oneness");setStatus(undefined);setNotes("");setMessage("Draft ready. Edit it if needed, then run Theology check.");
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
    if(status==="blocked"){setMessage("This post needs revision before it can leave Threads Studio.");return false;}
    return true;
  }

  async function sendToPublishing(){
    if(!ready()) return;
    setBusy("ready");
    try{
      const r=await fetch("/api/admin/threads-studio/ready",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({allowWarnings:status==="warning",items:[{body:body.trim(),category,doctrineStatus:status,mirrorToX:false}]})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Could not send this Thread to Publishing.");
      const readyId=Array.isArray(d.posts)&&d.posts[0]?.id?String(d.posts[0].id):"";
      if(!readyId) throw new Error("Thread was saved, but its publishing ID was not returned.");
      setMessage("Ready. Opening Publishing…");
      window.location.assign(`/admin/publishing?view=threads&threadId=${encodeURIComponent(readyId)}`);
    }catch(e){setMessage(e instanceof Error?e.message:"Could not send this Thread to Publishing.");setBusy(undefined);}
  }

  return <div className="threads-panel threads-single-composer">
    <div className="threads-panel-title"><div><strong>Single Thread</strong><span>Create and review one post.</span></div><PenLine size={18}/></div>
    <div className="threads-mode-switch"><button type="button" className={mode==="generate"?"is-active":""} onClick={()=>setMode("generate")}><Sparkles size={14}/> Generate one</button><button type="button" className={mode==="manual"?"is-active":""} onClick={()=>setMode("manual")}><PenLine size={14}/> Write manually</button></div>
    {mode==="generate"?<><label><span>Direction</span><textarea rows={3} value={prompt} placeholder="Example: A serious but witty thought about Deuteronomy 6:4 and how plainly Scripture says God is one." onChange={e=>setPrompt(e.target.value)}/></label><button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={()=>void generate()}>{busy==="generate"?<Loader2 className="spin" size={15}/>:<Sparkles size={15}/>} Generate one</button></>:null}
    <label><span>Type</span><select value={category} onChange={e=>{setCategory(e.target.value as Category);setStatus(undefined);}}><option value="oneness">Oneness theology</option><option value="scripture">Scripture observation</option><option value="witty">Serious + witty</option><option value="question">Question</option><option value="app">Apostolic Guide</option><option value="response">General response</option></select></label>
    <label><span>Post</span><textarea rows={7} maxLength={500} placeholder="Write the post exactly how you want it to publish…" value={body} onChange={e=>{setBody(e.target.value);setStatus(undefined);setNotes("");}}/><small className="threads-char-count">{body.length} / 500</small></label>
    <div className="threads-review-actions"><button className="button" type="button" disabled={Boolean(busy)||!body.trim()} onClick={()=>void review()}>{busy==="review"?<Loader2 className="spin" size={15}/>:<ShieldCheck size={15}/>} Theology check</button>{status?<span className={`threads-doctrine-badge is-${status}`}>{status}</span>:null}</div>
    {notes?<p className="threads-doctrine-note">{notes}</p>:null}
    <div className="threads-single-actions"><button className="button button-primary" type="button" disabled={Boolean(busy)||!body.trim()||status==="blocked"} onClick={()=>void sendToPublishing()}>{busy==="ready"?<Loader2 className="spin" size={15}/>:<Send size={15}/>} Send to Publishing</button></div>
    <p className="threads-status">{message}</p>
  </div>;
}

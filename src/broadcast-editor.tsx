"use client";

import { useMemo, useState } from "react";
import type { BroadcastCampaign } from "./broadcast-email";
import {CodeModeJsonPanel} from "./code-mode/json-panel";
import {CodeModeSandboxPreview} from "./code-mode/preview";
import {emailCodeSchema,initialEmailCodeDocument,emailCodeRender,type EmailCodeDocument} from "./code-mode/broadcast";
import {DoctrineCheckPanel} from "./doctrine-check-panel";
import { ExternalLink, FileText, Headphones, MailCheck, MessageSquareText, Play, Send, TestTube2, Waypoints } from "lucide-react";

export type BroadcastSourceOption = {
  kind: "article" | "topic" | "answer" | "pathway";
  title: string;
  summary: string;
  url: string;
  publishedAt?: string;
};

type CampaignType = BroadcastSourceOption["kind"] | "youtube" | "podcast" | "announcement";
type AudienceKey = "general" | "content" | "media";

type Campaign = {
  type: CampaignType;
  subject: string;
  previewText: string;
  eyebrow: string;
  title: string;
  summary: string;
  ctaLabel: string;
  url: string;
  resources?: BroadcastCampaign["resources"];
};

const templates: Array<{ type: CampaignType; label: string; icon: typeof FileText }> = [
  { type: "article", label: "New article", icon: FileText },
  { type: "topic", label: "New topic", icon: MessageSquareText },
  { type: "answer", label: "New answer", icon: MailCheck },
  { type: "pathway", label: "New pathway", icon: Waypoints },
  { type: "youtube", label: "YouTube episode", icon: Play },
  { type: "podcast", label: "Podcast episode", icon: Headphones },
  { type: "announcement", label: "Announcement", icon: Send }
];

const labels: Record<CampaignType, { eyebrow: string; subjectPrefix: string; previewPrefix: string; cta: string }> = {
  article: { eyebrow: "New article", subjectPrefix: "New article:", previewPrefix: "A new Scripture study is now available:", cta: "Read the article" },
  topic: { eyebrow: "New topic", subjectPrefix: "Study a new topic:", previewPrefix: "A new biblical topic is ready to explore:", cta: "Explore the topic" },
  answer: { eyebrow: "New answer", subjectPrefix: "A new Bible answer:", previewPrefix: "A new question has been answered:", cta: "Read the answer" },
  pathway: { eyebrow: "New pathway", subjectPrefix: "New study pathway:", previewPrefix: "Follow a new Scripture pathway:", cta: "Start the pathway" },
  youtube: { eyebrow: "New episode", subjectPrefix: "New episode:", previewPrefix: "A new Apostolic Guide episode is available:", cta: "Watch the episode" },
  podcast: { eyebrow: "New podcast", subjectPrefix: "New podcast:", previewPrefix: "A new Apostolic Guide podcast episode is available:", cta: "Listen to the episode" },
  announcement: { eyebrow: "Apostolic Guide update", subjectPrefix: "Apostolic Guide:", previewPrefix: "A new update from Apostolic Guide:", cta: "View the update" }
};

function defaultAudience(type: CampaignType): AudienceKey {
  if (["article", "topic", "answer", "pathway"].includes(type)) return "content";
  if (["youtube", "podcast"].includes(type)) return "media";
  return "general";
}

function campaignFrom(type: CampaignType, source?: BroadcastSourceOption): Campaign {
  const copy = labels[type];
  const title = source?.title ?? "";
  return {
    type,
    subject: title ? `${copy.subjectPrefix} ${title}` : copy.subjectPrefix,
    previewText: title ? `${copy.previewPrefix} ${title}` : copy.previewPrefix,
    eyebrow: copy.eyebrow,
    title,
    summary: source?.summary ?? "",
    ctaLabel: copy.cta,
    url: source?.url ?? ""
  };
}

export function BroadcastEditor({ sources, audienceCounts, initialCampaign }: { sources: BroadcastSourceOption[]; audienceCounts: Record<AudienceKey, number>; initialCampaign?: BroadcastCampaign }) {
  const newestByKind = useMemo(() => {
    const result = new Map<string, BroadcastSourceOption>();
    for (const source of sources) if (!result.has(source.kind)) result.set(source.kind, source);
    return result;
  }, [sources]);
  const initialSource = newestByKind.get("article");
  const [campaign, setCampaign] = useState<Campaign>(() => initialCampaign ?? campaignFrom("article", initialSource));
  const [audience, setAudience] = useState<AudienceKey>("content");
  const [sourceUrl, setSourceUrl] = useState(initialCampaign?.url ?? initialSource?.url ?? "");
  const [state, setState] = useState<"idle" | "working" | "draft" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [codeOpen,setCodeOpen]=useState(false);
  const [codeDoc,setCodeDoc]=useState<EmailCodeDocument|null>(null);
  const [draftId,setDraftId]=useState<string|null>(null);
  const [version,setVersion]=useState(0);
  const [revisions,setRevisions]=useState<Array<{version:number;created_at:string}>>([]);
  const [doctrineReady,setDoctrineReady]=useState(false);
  const [codeError,setCodeError]=useState("");
  const editableDoc:EmailCodeDocument={...(codeDoc||initialEmailCodeDocument(campaign)),campaign};
  const documentMatches=Boolean(codeDoc&&JSON.stringify(codeDoc.campaign)===JSON.stringify(campaign));
  const authorized=Boolean(draftId&&doctrineReady&&documentMatches);
  async function saveCode(next:EmailCodeDocument){
   setCodeError("");
   const checked=emailCodeSchema.parse(next);
   const response=await fetch("/api/admin/broadcast-code",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:draftId||undefined,expectedVersion:version||undefined,document:checked})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||"Draft save failed.");
   setDraftId(result.draft.id);setVersion(result.draft.version);
   setCodeDoc(result.draft.document);setCampaign(result.draft.document.campaign);
   setDoctrineReady(false);setBroadcastId(null);
   const history=await fetch("/api/admin/broadcast-code?id="+encodeURIComponent(result.draft.id)).then(r=>r.json());
   setRevisions(history.revisions||[]);setMessage("Code Mode draft saved. Run the required doctrine check before any email action.");
  }
  async function restoreCode(revisionVersion:number){
   if(!draftId)return;
   setCodeError("");
   const response=await fetch("/api/admin/broadcast-code",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:draftId,expectedVersion:version,revisionVersion})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||"Restore failed.");
   setCodeDoc(result.draft.document);setCampaign(result.draft.document.campaign);setVersion(result.draft.version);
   setDoctrineReady(false);setBroadcastId(null);
   const history=await fetch("/api/admin/broadcast-code?id="+encodeURIComponent(draftId)).then(r=>r.json());setRevisions(history.revisions||[]);
  }

  const matchingSources = sources.filter((source) => source.kind === campaign.type);
  const audienceLabel = audience === "content" ? "New content" : audience === "media" ? "Teachings & media" : "All subscribers";

  function chooseType(type: CampaignType) {
    const source = newestByKind.get(type);
    const next = campaignFrom(type, source);
    setCampaign(next);
    setSourceUrl(source?.url ?? "");
    setAudience(defaultAudience(type));
    setBroadcastId(null);setDraftId(null);setVersion(0);setCodeDoc(null);setDoctrineReady(false);
    setState("idle");
    setMessage("");
  }

  function chooseSource(url: string) {
    setSourceUrl(url);
    const source = matchingSources.find((item) => item.url === url);
    if (source) setCampaign(campaignFrom(campaign.type, source));
    setDraftId(null);setCodeDoc(null);setDoctrineReady(false);setBroadcastId(null);
  }

  async function callApi(payload: unknown) {
    const response = await fetch("/api/admin/broadcasts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Email operation failed.");
    return result;
  }

  async function sendTest() {
    if(!authorized)return setMessage("Save the current Code Mode draft and pass its required Doctrine check first.");
    setState("working"); setMessage("");
    try {
      const result = await callApi({ action: "test", campaign, draftId });
      setState("idle"); setMessage(`Test sent to ${result.sentTo}.`);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Test failed."); }
  }

  async function createDraft() {
    if(!authorized)return setMessage("Save and approve the current email before creating a Resend draft.");
    setState("working"); setMessage("");
    try {
      const result = await callApi({ action: "create", audience, campaign, draftId });
      setBroadcastId(result.broadcastId); setState("draft"); setMessage("Campaign draft created. Review it, send yourself a test, then send when ready.");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Draft creation failed."); }
  }

  async function sendCampaign() {
    if (!broadcastId || !authorized) return;
    if (!window.confirm(`Send “${campaign.subject}” to ${audienceCounts[audience]} ${audienceLabel.toLowerCase()} subscriber${audienceCounts[audience] === 1 ? "" : "s"}? This cannot be unsent.`)) return;
    setState("working"); setMessage("");
    try {
      await callApi({ action: "send", broadcastId, draftId });
      setState("sent"); setMessage("Campaign has been handed to Resend for delivery.");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Send failed."); }
  }

  const isExternal = campaign.type === "youtube" || campaign.type === "podcast" || campaign.type === "announcement";
  const valid = campaign.subject.trim().length >= 3 && campaign.previewText.trim().length >= 3 && campaign.title.trim().length >= 3 && campaign.summary.trim().length >= 10 && /^https?:\/\//.test(campaign.url);

  return (
    <div className="broadcast-workspace">
      <div className="broadcast-template-grid">
        {templates.map(({ type, label, icon: Icon }) => <button key={type} type="button" className={campaign.type === type ? "broadcast-template active" : "broadcast-template"} onClick={() => chooseType(type)}><Icon size={18} /><span>{label}</span></button>)}
      </div>

      <div className="broadcast-actions">
        <button type="button" className="button button-outline" onClick={()=>setCodeOpen(v=>!v)} aria-expanded={codeOpen}>{codeOpen?"Close Code Mode":"Open Code Mode"}</button>
        {!draftId?<button type="button" className="button" onClick={()=>void saveCode(editableDoc).catch(e=>setCodeError(e.message))}>Save draft for Doctrine check</button>:null}
      </div>
      {codeOpen?<section className="admin-card" style={{padding:18,display:"grid",gap:16}}>
        <h3>Shared Code Mode · Broadcasts</h3>
        <p>Edit the full campaign in JSON. HTML and CSS are in theme; footer, unsubscribe and site link cannot be removed.</p>
        <CodeModeJsonPanel label="Whole-campaign JSON" data={editableDoc} parse={v=>emailCodeSchema.parse(v)} onApply={saveCode}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
          <label>HTML template<textarea rows={10} value={editableDoc.theme.html} onChange={e=>setCodeDoc({...editableDoc,theme:{...editableDoc.theme,html:e.target.value}})} /></label>
          <label>CSS<textarea rows={10} value={editableDoc.theme.css} onChange={e=>setCodeDoc({...editableDoc,theme:{...editableDoc.theme,css:e.target.value}})} /></label>
        </div>
        <label>Container width <input type="number" min={320} max={720} value={editableDoc.theme.containerWidth} onChange={e=>setCodeDoc({...editableDoc,theme:{...editableDoc.theme,containerWidth:Number(e.target.value)}})}/></label>
        <button type="button" className="button" onClick={()=>void saveCode(editableDoc).catch(e=>setCodeError(e.message))}>Apply HTML / CSS to saved draft</button>
        {(()=>{try{return <CodeModeSandboxPreview title="Email code preview" document={emailCodeRender(editableDoc).html}/>;}catch(error){return <p role="alert">{error instanceof Error?error.message:"Invalid email design"}</p>;}})()}
        {revisions.length?<details><summary>Revisions · Undo / Restore</summary>{revisions.map(rev=><button type="button" key={rev.version} onClick={()=>void restoreCode(rev.version).catch(e=>setCodeError(e.message))}>Restore version {rev.version} ({new Date(rev.created_at).toLocaleString()})</button>)}</details>:null}
      </section>:null}
      {codeError?<p role="alert">{codeError}</p>:null}
      {draftId?<DoctrineCheckPanel key={draftId+":"+version} sourceType="broadcast" sourceId={draftId} onChange={approved=>setDoctrineReady(approved)}/>:<p className="broadcast-draft-note">Save a local draft to unlock the required Doctrine checker. No email is sent by saving.</p>}
      <div className="broadcast-compose-grid">
        <div className="broadcast-fields">
          {!isExternal && matchingSources.length > 0 ? <label>Published content<select value={sourceUrl} onChange={(e) => chooseSource(e.target.value)}>{matchingSources.map((source) => <option key={source.url} value={source.url}>{source.title}</option>)}</select></label> : null}
          <label>Audience<select value={audience} onChange={(e) => setAudience(e.target.value as AudienceKey)}><option value="content">New content · {audienceCounts.content}</option><option value="media">Teachings & media · {audienceCounts.media}</option><option value="general">All subscribers · {audienceCounts.general}</option></select></label>
          <label>Subject<input value={campaign.subject} onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })} /></label>
          <label>Inbox preview<input value={campaign.previewText} onChange={(e) => setCampaign({ ...campaign, previewText: e.target.value })} /></label>
          <div className="form-row"><label>Email label<input value={campaign.eyebrow} onChange={(e) => setCampaign({ ...campaign, eyebrow: e.target.value })} /></label><label>Button text<input value={campaign.ctaLabel} onChange={(e) => setCampaign({ ...campaign, ctaLabel: e.target.value })} /></label></div>
          <label>Headline<input value={campaign.title} onChange={(e) => setCampaign({ ...campaign, title: e.target.value })} placeholder={isExternal ? "Episode or announcement title" : "Headline"} /></label>
          <label>Message<textarea className="broadcast-summary" value={campaign.summary} onChange={(e) => setCampaign({ ...campaign, summary: e.target.value })} placeholder="A concise reason this is worth opening." /></label>
          <label>Destination URL<input type="url" value={campaign.url} onChange={(e) => setCampaign({ ...campaign, url: e.target.value })} placeholder={campaign.type === "youtube" ? "https://youtube.com/watch?..." : campaign.type === "podcast" ? "https://..." : "https://apostolicguide.com/..."} /></label>
        </div>

        <aside className="broadcast-preview">
          <span className="section-kicker">Email preview</span>
          <div className="broadcast-email-card"><small>{campaign.eyebrow || "Apostolic Guide"}</small><h3>{campaign.title || "Your headline"}</h3><p>{campaign.summary || "Your email message will appear here."}</p><span className="broadcast-preview-button">{campaign.ctaLabel || "Open"}</span></div>
          <div className="broadcast-inbox-preview"><strong>{campaign.subject || "Subject line"}</strong><span>{campaign.previewText || "Inbox preview text"}</span></div>
          <div className="broadcast-audience-summary"><strong>{audienceCounts[audience]}</strong><span>{audienceLabel} recipients</span></div>
        </aside>
      </div>

      <div className="broadcast-actions">
        <button className="button button-outline" type="button" onClick={sendTest} disabled={!valid || !authorized || state === "working"}><TestTube2 size={16} /> Send test to me</button>
        {!broadcastId ? <button className="button button-crimson" type="button" onClick={createDraft} disabled={!valid || !authorized || state === "working"}>{state === "working" ? "Creating…" : "Create campaign draft"}</button> : state !== "sent" ? <button className="button button-crimson" type="button" onClick={sendCampaign} disabled={!authorized || state === "working"}><Send size={16} /> Send to {audienceCounts[audience]}</button> : <span className="status-pill">Sent</span>}
      </div>
      {message ? <p className={state === "error" ? "form-error" : "form-success"}>{message}</p> : null}
      {broadcastId && state !== "sent" ? <p className="broadcast-draft-note">Draft ID {broadcastId}. You can also review this campaign in Resend before sending.</p> : null}
    </div>
  );
}

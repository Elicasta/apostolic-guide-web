"use client";

import { useMemo, useState } from "react";
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

export function BroadcastEditor({ sources, audienceCounts }: { sources: BroadcastSourceOption[]; audienceCounts: Record<AudienceKey, number> }) {
  const newestByKind = useMemo(() => {
    const result = new Map<string, BroadcastSourceOption>();
    for (const source of sources) if (!result.has(source.kind)) result.set(source.kind, source);
    return result;
  }, [sources]);
  const initialSource = newestByKind.get("article");
  const [campaign, setCampaign] = useState<Campaign>(() => campaignFrom("article", initialSource));
  const [audience, setAudience] = useState<AudienceKey>("content");
  const [sourceUrl, setSourceUrl] = useState(initialSource?.url ?? "");
  const [state, setState] = useState<"idle" | "working" | "draft" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [broadcastId, setBroadcastId] = useState<string | null>(null);

  const matchingSources = sources.filter((source) => source.kind === campaign.type);
  const audienceLabel = audience === "content" ? "New content" : audience === "media" ? "Teachings & media" : "All subscribers";

  function chooseType(type: CampaignType) {
    const source = newestByKind.get(type);
    const next = campaignFrom(type, source);
    setCampaign(next);
    setSourceUrl(source?.url ?? "");
    setAudience(defaultAudience(type));
    setBroadcastId(null);
    setState("idle");
    setMessage("");
  }

  function chooseSource(url: string) {
    setSourceUrl(url);
    const source = matchingSources.find((item) => item.url === url);
    if (source) setCampaign(campaignFrom(campaign.type, source));
  }

  async function callApi(payload: unknown) {
    const response = await fetch("/api/admin/broadcasts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Email operation failed.");
    return result;
  }

  async function sendTest() {
    setState("working"); setMessage("");
    try {
      const result = await callApi({ action: "test", campaign });
      setState("idle"); setMessage(`Test sent to ${result.sentTo}.`);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Test failed."); }
  }

  async function createDraft() {
    setState("working"); setMessage("");
    try {
      const result = await callApi({ action: "create", audience, campaign });
      setBroadcastId(result.broadcastId); setState("draft"); setMessage("Campaign draft created. Review it, send yourself a test, then send when ready.");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Draft creation failed."); }
  }

  async function sendCampaign() {
    if (!broadcastId) return;
    if (!window.confirm(`Send “${campaign.subject}” to ${audienceCounts[audience]} ${audienceLabel.toLowerCase()} subscriber${audienceCounts[audience] === 1 ? "" : "s"}? This cannot be unsent.`)) return;
    setState("working"); setMessage("");
    try {
      await callApi({ action: "send", broadcastId });
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
        <button className="button button-outline" type="button" onClick={sendTest} disabled={!valid || state === "working"}><TestTube2 size={16} /> Send test to me</button>
        {!broadcastId ? <button className="button button-crimson" type="button" onClick={createDraft} disabled={!valid || state === "working"}>{state === "working" ? "Creating…" : "Create campaign draft"}</button> : state !== "sent" ? <button className="button button-crimson" type="button" onClick={sendCampaign} disabled={state === "working"}><Send size={16} /> Send to {audienceCounts[audience]}</button> : <span className="status-pill">Sent</span>}
      </div>
      {message ? <p className={state === "error" ? "form-error" : "form-success"}>{message}</p> : null}
      {broadcastId && state !== "sent" ? <p className="broadcast-draft-note">Draft ID {broadcastId}. You can also review this campaign in Resend before sending.</p> : null}
    </div>
  );
}

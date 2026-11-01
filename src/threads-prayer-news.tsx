"use client";

import { useState } from "react";
import { Copy, ExternalLink, Globe2, Loader2, Newspaper, RefreshCw, Send, Sparkles } from "lucide-react";

type Item = {
  headline: string;
  eventSummary: string;
  sourceTitle: string;
  sourceUrl: string;
  publishedAt?: string;
  draft?: string;
  whyAppropriate?: string;
};

export function ThreadsPrayerNews() {
  const [focus, setFocus] = useState("church, missions, persecution, humanitarian crises, natural disasters, public tragedy, and events where a brief prayerful response could be appropriate");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("Christian news first. Sol only drafts after you choose a source.");

  async function scan() {
    setBusy("scan");
    setMessage("Checking Christian news sources…");
    try {
      const response = await fetch("/api/admin/threads-studio/news", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ focus, count: 6 })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "News scan failed.");
      setItems(Array.isArray(data.items) ? data.items : []);
      const sourceNote = Array.isArray(data.sources) ? data.sources.join(" + ") : "Christian news";
      setMessage(data.items?.length ? `${data.items.length} current source items from ${sourceNote}. Open a source, then ask Sol to draft from that item.` : "No usable source items were returned right now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "News scan failed.");
    } finally { setBusy(undefined); }
  }

  async function draft(item: Item) {
    setBusy(`draft:${item.sourceUrl}`);
    setMessage(`Drafting only from ${item.sourceTitle}…`);
    try {
      const response = await fetch("/api/admin/threads-studio/news/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Prayer draft failed.");
      setItems((current) => current.map((candidate) => candidate.sourceUrl === item.sourceUrl ? { ...candidate, draft: String(data.draft || ""), whyAppropriate: String(data.whyAppropriate || "") } : candidate));
      setMessage("Draft created from the selected source. Edit it if needed, then send the reviewed copy to Publishing.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prayer draft failed.");
    } finally { setBusy(undefined); }
  }

  function updateDraft(sourceUrl: string, draft: string) {
    setItems((current) => current.map((item) => item.sourceUrl === sourceUrl ? { ...item, draft } : item));
  }

  function copy(value: string) {
    void navigator.clipboard?.writeText(value);
    setMessage("Draft copied.");
  }

  async function send(item: Item) {
    if (!item.draft?.trim()) return;
    setBusy(`send:${item.sourceUrl}`);
    setMessage("Saving reviewed prayer draft…");
    try {
      const response = await fetch("/api/admin/threads-studio/ready", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowWarnings: false, items: [{ body: item.draft.trim(), category: "prayer-news", doctrineStatus: "pass", sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl, sourceSummary: item.eventSummary, mirrorToX: false }] })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not send the prayer draft to Publishing.");
      const readyId = Array.isArray(data.posts) && data.posts[0]?.id ? String(data.posts[0].id) : "";
      if (!readyId) throw new Error("Prayer draft was saved, but its publishing ID was not returned.");
      window.location.assign(`/admin/publishing?view=threads&threadId=${encodeURIComponent(readyId)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the prayer draft to Publishing.");
      setBusy(undefined);
    }
  }

  return <div className="threads-panel threads-prayer-news-v2">
    <div className="threads-panel-title"><div><strong>Prayer + Christian news</strong><span>Source first. Draft second. Publishing last.</span></div><Globe2 size={18}/></div>
    <div className="threads-news-source-strip"><Newspaper size={16}/><div><strong>Christian news sources</strong><span>The Christian Post + Christianity Today. Sol does not search the web in this step.</span></div></div>
    <label><span>What kinds of stories should I surface?</span><textarea rows={3} value={focus} onChange={(event) => setFocus(event.target.value)}/></label>
    <button className="button" onClick={() => void scan()} disabled={Boolean(busy)}>{busy === "scan" ? <Loader2 className="spin" size={15}/> : <RefreshCw size={15}/>} Check Christian news</button>
    <p className="threads-status">{message}</p>
    <div className="threads-news-list">{items.map((item) => {
      const drafting = busy === `draft:${item.sourceUrl}`;
      const sending = busy === `send:${item.sourceUrl}`;
      return <article key={item.sourceUrl} className={item.draft ? "has-draft" : ""}>
        <span className="threads-news-source">{item.sourceTitle}{item.publishedAt ? ` · ${item.publishedAt}` : ""}</span>
        <strong>{item.headline}</strong>
        <p>{item.eventSummary}</p>
        <div className="threads-news-source-actions"><a href={item.sourceUrl} target="_blank" rel="noreferrer">Read source <ExternalLink size={12}/></a><button className="button small" disabled={Boolean(busy)} onClick={() => void draft(item)}>{drafting ? <Loader2 className="spin" size={13}/> : <Sparkles size={13}/>} {item.draft ? "Redraft from source" : "Draft prayer Thread"}</button></div>
        {item.draft !== undefined ? <div className="threads-news-draft"><label><span>Thread draft</span><textarea rows={5} value={item.draft} onChange={(event) => updateDraft(item.sourceUrl, event.target.value)}/></label>{item.whyAppropriate ? <small>{item.whyAppropriate}</small> : null}<div><button className="button small" onClick={() => copy(item.draft || "")}><Copy size={13}/> Copy</button><button className="button small primary" disabled={Boolean(busy) || !item.draft.trim()} onClick={() => void send(item)}>{sending ? <Loader2 className="spin" size={13}/> : <Send size={13}/>} Reviewed → Publishing</button></div></div> : null}
      </article>;
    })}</div>
  </div>;
}

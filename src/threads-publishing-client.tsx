"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ExternalLink, Loader2, MessageCircle, Send, Settings, ShieldCheck } from "lucide-react";

type ThreadStatus = "ready" | "scheduled" | "published" | "failed" | string;
type DoctrineStatus = "pass" | "warning" | "blocked" | null;
type ThreadPost = {
  id: string;
  batch_id?: string | null;
  category: string;
  body: string;
  doctrine_status?: DoctrineStatus;
  doctrine_notes?: string | null;
  status: ThreadStatus;
  scheduled_for?: string | null;
  published_at?: string | null;
  threads_permalink?: string | null;
  source_title?: string | null;
  source_url?: string | null;
  source_summary?: string | null;
  updated_at?: string | null;
};

type Payload = { posts?: ThreadPost[]; configured?: boolean; error?: string };

function localInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function categoryLabel(value: string) {
  if (value === "prayer-news") return "Prayer + news";
  if (value === "oneness") return "Oneness theology";
  if (value === "app") return "Apostolic Guide";
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ThreadsPublishingClient({ connected, canPublish }: { connected: boolean; canPublish: boolean }) {
  const [posts, setPosts] = useState<ThreadPost[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [scheduleLocal, setScheduleLocal] = useState(() => localInputValue(new Date(Date.now() + 60 * 60_000)));
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("Loading ready Threads…");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/threads-studio/ready", { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as Payload;
      if (!response.ok) throw new Error(data.error || "Threads publishing queue could not be loaded.");
      const next = data.posts ?? [];
      setPosts(next);
      const ready = next.filter((post) => post.status === "ready");
      setSelectedId((current) => ready.some((post) => post.id === current) ? current : ready[0]?.id ?? "");
      setMessage(ready.length ? `${ready.length} ${ready.length === 1 ? "Thread is" : "Threads are"} ready for final distribution.` : "No approved Threads are waiting to publish.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Threads publishing queue could not be loaded.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const readyPosts = useMemo(() => posts.filter((post) => post.status === "ready"), [posts]);
  const scheduledCount = useMemo(() => posts.filter((post) => post.status === "scheduled").length, [posts]);
  const publishedCount = useMemo(() => posts.filter((post) => post.status === "published").length, [posts]);
  const selected = readyPosts.find((post) => post.id === selectedId) ?? readyPosts[0] ?? null;

  async function publishNow() {
    if (!selected) return;
    if (!connected) return setMessage("Connect Threads in Publishing Connections before posting directly.");
    setBusy("publish");
    try {
      const response = await fetch("/api/admin/threads-studio/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          body: selected.body,
          category: selected.category,
          doctrineStatus: selected.doctrine_status || "pass"
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Threads publish failed.");
      setMessage("Published to Threads.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Threads publish failed.");
    } finally {
      setBusy(undefined);
    }
  }

  async function schedule() {
    if (!selected) return;
    const when = new Date(scheduleLocal);
    if (!Number.isFinite(when.getTime())) return setMessage("Choose a valid schedule time.");
    setBusy("schedule");
    try {
      const response = await fetch("/api/admin/threads-studio/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          batchId: selected.batch_id || undefined,
          allowWarnings: selected.doctrine_status === "warning",
          items: [{
            id: selected.id,
            body: selected.body,
            category: selected.category,
            scheduledFor: when.toISOString(),
            doctrineStatus: selected.doctrine_status || "pass",
            sourceTitle: selected.source_title || undefined,
            sourceUrl: selected.source_url || undefined,
            sourceSummary: selected.source_summary || undefined,
            mirrorToX: false
          }]
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Threads scheduling failed.");
      setMessage(`Scheduled for ${when.toLocaleString()}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Threads scheduling failed.");
    } finally {
      setBusy(undefined);
    }
  }

  return <section className="master-threads-publisher">
    <div className="master-threads-summary">
      <div><strong>{readyPosts.length}</strong><span>Ready</span></div>
      <div><strong>{scheduledCount}</strong><span>Scheduled</span></div>
      <div><strong>{publishedCount}</strong><span>Published</span></div>
      <Link href="/admin/threads-studio"><MessageCircle size={15}/> Threads Studio</Link>
    </div>

    {!connected ? <div className="master-threads-connection-note"><Settings size={16}/><div><strong>Threads is not connected for direct posting.</strong><span>You can still schedule approved copy. Connect the account before Publish Now will work.</span></div><Link href="/admin/setup#social-publishing">Connections</Link></div> : null}

    {selected ? <div className="master-threads-grid">
      <section className="master-threads-card master-threads-copy-card">
        <div className="master-threads-card-head"><div><span>Ready Thread</span><strong>Final copy</strong></div><MessageCircle size={19}/></div>
        <label><span>Select approved Thread</span><select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{readyPosts.map((post, index) => <option key={post.id} value={post.id}>#{index + 1} · {categoryLabel(post.category)} · {post.body.slice(0, 54)}{post.body.length > 54 ? "…" : ""}</option>)}</select></label>
        <div className="master-thread-copy"><p>{selected.body}</p><small>{selected.body.length} / 500</small></div>
        <div className="master-thread-meta"><span>{categoryLabel(selected.category)}</span><span className={`is-${selected.doctrine_status || "pass"}`}><ShieldCheck size={12}/> {selected.doctrine_status || "pass"}</span></div>
        {selected.doctrine_notes ? <p className="master-thread-review-note">{selected.doctrine_notes}</p> : null}
        {selected.source_url ? <div className="master-thread-source"><strong>{selected.source_title || "Reviewed source"}</strong>{selected.source_summary ? <p>{selected.source_summary}</p> : null}<a href={selected.source_url} target="_blank" rel="noreferrer">Open source <ExternalLink size={13}/></a></div> : null}
        <p className="master-thread-lock-note"><Check size={13}/> Copy is locked here so theology-reviewed text cannot be changed after approval. Edit it in Threads Studio and review again if needed.</p>
      </section>

      <section className="master-threads-card master-threads-action-card">
        <div className="master-threads-card-head"><div><span>Destination</span><strong>Threads</strong></div><MessageCircle size={19}/></div>
        <div className="master-thread-action-block"><div><strong>Publish now</strong><span>Post this approved Thread immediately.</span></div><button className="button button-primary" type="button" disabled={!canPublish || !connected || Boolean(busy)} onClick={() => void publishNow()}>{busy === "publish" ? <Loader2 className="spin" size={15}/> : <Send size={15}/>} Publish to Threads</button></div>
        <div className="master-thread-action-block"><div><strong>Schedule</strong><span>Place it on the shared publishing calendar.</span></div><input type="datetime-local" value={scheduleLocal} onChange={(event) => setScheduleLocal(event.target.value)}/><button className="button" type="button" disabled={!canPublish || Boolean(busy)} onClick={() => void schedule()}>{busy === "schedule" ? <Loader2 className="spin" size={15}/> : <CalendarDays size={15}/>} Add to calendar</button></div>
        <p className="master-thread-status">{message}</p>
      </section>
    </div> : <div className="master-threads-empty"><MessageCircle size={25}/><strong>No Threads waiting for Publishing.</strong><span>Create a single post or approve a weekly batch in Threads Studio. Ready copy will appear here automatically.</span><Link className="button button-primary" href="/admin/threads-studio">Open Threads Studio</Link><p>{message}</p></div>}
  </section>;
}

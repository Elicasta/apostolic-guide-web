"use client";

import { createPortal } from "react-dom";
import { FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./episode-draft-tools.module.css";

type Episode = { id: string; title: string; updated_at: string };
type Article = { id: string; title: string; body: string; status: "draft" | "ready" | "archived"; updated_at?: string };

export function EpisodeDraftTools() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [episodeId, setEpisodeId] = useState("");
  const [article, setArticle] = useState<Article | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const sync = async () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const context = document.querySelector<HTMLElement>(".episode-lane-context");
        const actions = context?.querySelector<HTMLElement>(":scope > div:last-child");
        const title = context?.querySelector<HTMLHeadingElement>("h2")?.textContent?.trim() || "";
        setTarget(actions ?? null);
        if (!title) { setEpisodeId(""); return; }
        try {
          const response = await fetch("/api/admin/video-producer/episodes", { cache: "no-store" });
          const data = await response.json();
          if (!response.ok || cancelled) return;
          const matches = (data.episodes as Episode[] | undefined)?.filter((episode) => episode.title === title) ?? [];
          matches.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          if (!cancelled) setEpisodeId(matches[0]?.id || "");
        } catch { /* Episode Studio owns primary load errors. */ }
      }, 50);
    };
    void sync();
    const root = document.querySelector<HTMLElement>(".episode-lane-page");
    const observer = root ? new MutationObserver(() => void sync()) : null;
    observer?.observe(root!, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-active"] });
    return () => { cancelled = true; window.clearTimeout(timer); observer?.disconnect(); };
  }, []);

  useEffect(() => {
    if (!episodeId) { setArticle(null); return; }
    let cancelled = false;
    void fetch(`/api/admin/episode-studio/${episodeId}/article`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (!cancelled) setArticle(data?.article ?? null); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [episodeId]);

  async function generateArticle() {
    if (!episodeId) return;
    setBusy("generate"); setMessage("");
    try {
      const response = await fetch(`/api/admin/episode-studio/${episodeId}/article`, { method: "POST", headers: { "content-type": "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Article draft could not be created.");
      setArticle(data.article);
      setOpen(true);
      setMessage(data.reused ? "Article refreshed from the current episode script." : "Article draft created.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Article draft could not be created."); }
    finally { setBusy(""); }
  }

  async function saveArticle() {
    if (!episodeId || !article) return;
    setBusy("save"); setMessage("");
    try {
      const response = await fetch(`/api/admin/episode-studio/${episodeId}/article`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: article.title, body: article.body, status: article.status })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Article draft could not be saved.");
      setArticle(data.article);
      setMessage("Article draft saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Article draft could not be saved."); }
    finally { setBusy(""); }
  }

  if (!target || !episodeId) return null;
  const controls = <div className={styles.actions}>
    <button type="button" className="button small" disabled={Boolean(busy)} onClick={() => article ? setOpen(true) : void generateArticle()}>
      {busy === "generate" ? <Loader2 className="spin" size={13}/> : <FileText size={13}/>} {article ? "Edit article" : "Create article"}
    </button>
    {message && !open ? <small className={styles.note}>{message}</small> : null}
  </div>;

  const editor = open && article ? createPortal(<div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Episode article draft">
    <section className={styles.modal}>
      <header className={styles.head}><div><span>Episode Article</span><h2>Article draft</h2></div><button className={styles.close} type="button" onClick={() => setOpen(false)}>Close</button></header>
      <div className={styles.form}>
        <label>Title<input value={article.title} onChange={(event) => setArticle({ ...article, title: event.target.value })}/></label>
        <label>Article<textarea value={article.body} onChange={(event) => setArticle({ ...article, body: event.target.value })}/></label>
        <label>Status<select value={article.status} onChange={(event) => setArticle({ ...article, status: event.target.value as Article["status"] })}><option value="draft">Draft</option><option value="ready">Ready</option><option value="archived">Archived</option></select></label>
      </div>
      <footer className={styles.footer}>
        <span className={styles.status}>{message || "Saved separately from the Episode script."}</span>
        <button className={styles.secondary} type="button" disabled={Boolean(busy)} onClick={() => void generateArticle()}>{busy === "generate" ? "Refreshing…" : "Refresh from episode"}</button>
        <button className={styles.primary} type="button" disabled={Boolean(busy) || !article.title.trim()} onClick={() => void saveArticle()}>{busy === "save" ? "Saving…" : "Save article"}</button>
      </footer>
    </section>
  </div>, document.body) : null;

  return <>{createPortal(controls, target)}{editor}</>;
}

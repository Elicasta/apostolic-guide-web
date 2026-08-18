"use client";

import { createPortal } from "react-dom";
import { FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type Episode = { id: string; title: string; updated_at: string };

export function EpisodeDraftTools() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [episodeId, setEpisodeId] = useState("");
  const [busy, setBusy] = useState(false);
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
        } catch { /* main Episode Studio owns load errors */ }
      }, 40);
    };
    void sync();
    const root = document.querySelector<HTMLElement>(".episode-lane-page");
    const observer = root ? new MutationObserver(() => void sync()) : null;
    observer?.observe(root!, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-active"] });
    return () => { cancelled = true; window.clearTimeout(timer); observer?.disconnect(); };
  }, []);

  async function createArticle() {
    if (!episodeId) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/episode-studio/${episodeId}/article`, { method: "POST", headers: { "content-type": "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Article draft could not be created.");
      setMessage(data.reused ? "Article draft updated from this script." : "Article draft saved from this episode.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Article draft could not be created.");
    } finally { setBusy(false); }
  }

  if (!target || !episodeId) return null;
  return createPortal(<div className="episode-draft-tools">
    <button type="button" className="button small" disabled={busy} onClick={() => void createArticle()}>{busy ? <Loader2 className="spin" size={13}/> : <FileText size={13}/>} Article draft</button>
    {message ? <small>{message}</small> : null}
  </div>, target);
}

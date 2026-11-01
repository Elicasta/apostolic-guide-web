"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Images, Instagram, LayoutGrid, Play, Send } from "lucide-react";

type Mode = "video" | "post" | "carousel";
type CarouselHandoff = {
  pathwaySlug?: string | null;
  title?: string;
  total?: number;
  style?: string;
  output?: string;
};

function initialMode(): Mode {
  if (typeof window === "undefined") return "video";
  const value = new URLSearchParams(window.location.search).get("content");
  return value === "post" || value === "carousel" ? value : "video";
}

export function InstagramPublishingWorkflow() {
  const [target, setTarget] = useState<Element | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [handoff, setHandoff] = useState<CarouselHandoff | null>(null);

  useEffect(() => {
    const syncTarget = () => setTarget(document.querySelector(".publishing-workspace"));
    syncTarget();
    const timer = window.setInterval(syncTarget, 400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ag-carousel-publishing-handoff-v1");
      setHandoff(raw ? JSON.parse(raw) as CarouselHandoff : null);
    } catch {
      setHandoff(null);
    }
  }, []);

  useEffect(() => {
    if (!(target instanceof HTMLElement)) return;
    target.dataset.contentPublishingMode = mode;
    return () => { delete target.dataset.contentPublishingMode; };
  }, [mode, target]);

  const meta = useMemo(() => {
    if (!handoff) return null;
    return {
      title: handoff.title?.trim() || "Carousel draft",
      slides: Math.max(1, Number(handoff.total) || 1),
      style: handoff.style?.trim() || "Apostolic Guide",
      pathway: handoff.pathwaySlug?.trim() || "Unassigned"
    };
  }, [handoff]);

  function choose(next: Mode) {
    setMode(next);
    const url = new URL(window.location.href);
    if (next === "video") url.searchParams.delete("content");
    else url.searchParams.set("content", next);
    window.history.replaceState({}, "", url.toString());
  }

  if (!target) return null;

  return createPortal(<>
    <section className="instagram-publishing-mode-switch" aria-label="Publishing content type">
      <div className="instagram-publishing-mode-heading"><Instagram size={18}/><div><strong>Instagram publishing</strong><span>Choose the asset type before review, scheduling, or publishing.</span></div></div>
      <div className="instagram-publishing-mode-tabs" role="tablist" aria-label="Instagram publishing type">
        <button type="button" className={mode === "video" ? "active" : ""} onClick={() => choose("video")}><Play size={14}/> Video & Reels</button>
        <button type="button" className={mode === "post" ? "active" : ""} onClick={() => choose("post")}><Images size={14}/> IG Post</button>
        <button type="button" className={mode === "carousel" ? "active" : ""} onClick={() => choose("carousel")}><LayoutGrid size={14}/> Carousel</button>
      </div>
    </section>

    {mode === "post" ? <section className="instagram-static-publishing-flow admin-card">
      <div className="instagram-flow-head"><div><span className="section-kicker">Instagram · single image</span><h2>Instagram Post</h2><p>Review the 4:5 artwork, write the caption, choose timing, then publish through the same Meta connection used by the suite.</p></div><Instagram size={24}/></div>
      <div className="instagram-flow-steps">
        <div><b>1</b><strong>Artwork</strong><span>1080 × 1350 public image URL</span></div>
        <div><b>2</b><strong>Caption</strong><span>Final copy, CTA, hashtags, alt text</span></div>
        <div><b>3</b><strong>Schedule</strong><span>Publish now or place on calendar</span></div>
        <div><b>4</b><strong>Meta publish</strong><span>Create media container, then publish</span></div>
      </div>
      <div className="instagram-flow-empty"><Images size={22}/><div><strong>No single-image draft selected</strong><span>Export an Instagram Post from Carousel Studio or add an approved image asset here.</span></div><a className="button" href="/admin/carousel-studio">Open Carousel Studio</a></div>
    </section> : null}

    {mode === "carousel" ? <section className="instagram-static-publishing-flow admin-card">
      <div className="instagram-flow-head"><div><span className="section-kicker">Instagram · carousel</span><h2>Instagram Carousel</h2><p>Review slide order, caption, timing, and publishing status independently from Reels.</p></div><LayoutGrid size={24}/></div>
      <div className="instagram-flow-steps">
        <div><b>1</b><strong>Slides</strong><span>2 to 10 hosted image/video assets</span></div>
        <div><b>2</b><strong>Sequence</strong><span>Lock order and cover slide</span></div>
        <div><b>3</b><strong>Caption</strong><span>Final copy, CTA, hashtags</span></div>
        <div><b>4</b><strong>Meta publish</strong><span>Create child containers, carousel, then publish</span></div>
      </div>
      {meta ? <div className="instagram-carousel-handoff"><div><span>Staged from Carousel Studio</span><strong>{meta.title}</strong><small>{meta.slides} slides · {meta.style} · {meta.pathway}</small></div><a className="button" href="/admin/carousel-studio">Edit carousel</a><button className="button button-primary" type="button" disabled title="Direct posting activates after exported slide images are stored on public URLs and the Instagram content-publish permission is connected."><Send size={14}/> Publish after Meta setup</button></div> : <div className="instagram-flow-empty"><LayoutGrid size={22}/><div><strong>No carousel draft selected</strong><span>Finish a carousel in Carousel Studio and choose Continue to Publishing.</span></div><a className="button button-primary" href="/admin/carousel-studio">Create carousel</a></div>}
      <p className="instagram-meta-note">The publishing workflow is ready. Direct Meta publishing stays disabled until slide exports are stored at public URLs and the Instagram content publishing permission is verified.</p>
    </section> : null}
  </>, target);
}

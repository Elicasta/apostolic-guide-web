"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Send } from "lucide-react";

function readDraftMeta() {
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".carousel-sourcebar select"));
  const pathwaySlug = selects[0]?.value || null;
  const mode = selects[1]?.value || "pathway";
  const title = document.querySelector<HTMLElement>(".carousel-preview-card .carousel-card-heading h2")?.innerText?.trim() || "Carousel draft";
  const position = document.querySelector<HTMLElement>(".carousel-preview-nav strong")?.innerText?.trim() || "01 / 01";
  const styleButton = document.querySelector<HTMLButtonElement>(".carousel-style-tabs button.is-active");
  const style = styleButton?.querySelector("strong")?.textContent?.trim() || "";
  const total = Number(position.match(/\/\s*(\d+)/)?.[1] || 1);
  const output = document.querySelector<HTMLButtonElement>(".carousel-output-option.is-active strong")?.textContent?.trim() || "Instagram Carousel";
  const sourceRef = `${pathwaySlug || "carousel"}:${mode}:${title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)}`;
  return { pathwaySlug, mode, title, total, style, output, sourceRef };
}

export function CarouselPublishingBridge() {
  const router = useRouter();
  const [target, setTarget] = useState<Element | null>(null);
  const [busy, setBusy] = useState(false);
  const targetRef = useRef<Element | null>(null);
  useEffect(() => {
    const sync = () => {
      const next = document.querySelector(".carousel-output-card") || document.querySelector(".carousel-preview-card");
      if (next !== targetRef.current) { targetRef.current = next; setTarget(next); }
    };
    sync(); const timer = window.setInterval(sync, 500); return () => window.clearInterval(timer);
  }, []);
  async function stageDraft() {
    if (busy) return; setBusy(true); const meta = readDraftMeta();
    try {
      localStorage.setItem("ag-carousel-publishing-handoff-v1", JSON.stringify(meta));
      await fetch("/api/admin/content-calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pathwaySlug: meta.pathwaySlug, title: meta.title, contentType: "carousel", platform: "instagram", status: "draft", source: "carousel-studio", sourceRef: meta.sourceRef, metadata: { style: meta.style, mode: meta.mode, slides: meta.total, output: meta.output } }) });
    } catch {}
    router.push("/admin/publish?source=carousel-studio&platform=instagram");
  }
  if (!target) return null;
  return createPortal(<section className="carousel-publishing-bridge" aria-label="Publishing handoff"><div><strong><Send size={15}/> Ready for publishing</strong><span>Stage this carousel in the shared content calendar, then continue to Instagram publishing.</span></div><button type="button" className="button button-dark" onClick={() => void stageDraft()} disabled={busy}>{busy ? <Loader2 className="spin" size={15}/> : null} Continue to Publishing <ArrowRight size={15}/></button></section>, target);
}

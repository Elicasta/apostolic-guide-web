"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Send } from "lucide-react";

function readDraftMeta() {
  const title = document.querySelector<HTMLElement>(".carousel-preview-card .carousel-card-heading h2")?.innerText?.trim() || "Carousel draft";
  const position = document.querySelector<HTMLElement>(".carousel-preview-nav strong")?.innerText?.trim() || "";
  const styleButton = document.querySelector<HTMLButtonElement>(".carousel-style-tabs button.is-active");
  const style = styleButton?.querySelector("strong")?.textContent?.trim() || "";
  return { title, position, style, source: "carousel-studio", updatedAt: new Date().toISOString() };
}

export function CarouselPublishingBridge() {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const sync = () => setTarget(document.querySelector(".carousel-output-card") || document.querySelector(".carousel-preview-card"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  function stageDraft() {
    try { localStorage.setItem("ag-carousel-publishing-handoff-v1", JSON.stringify(readDraftMeta())); } catch {}
  }

  if (!target) return null;

  return createPortal(
    <section className="carousel-publishing-bridge" aria-label="Publishing handoff">
      <div>
        <strong><Send size={15}/> Ready for publishing</strong>
        <span>Export the approved carousel, then continue into the existing Channel Publishing workflow.</span>
      </div>
      <Link className="button button-dark" href="/admin/publish?source=carousel-studio" onClick={stageDraft}>
        Continue to Publishing <ArrowRight size={15}/>
      </Link>
    </section>,
    target
  );
}

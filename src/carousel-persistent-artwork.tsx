"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

type VisualStyle = "street" | "editorial" | "cinematic" | "verse" | "manifesto";
type Snapshot = {
  node: HTMLElement;
  order: number;
  total: number;
  pathway: string;
  title: string;
  scripture: string;
  body: string;
  overlay: string;
  cta: string;
  format: "single" | "carousel" | "story";
};

function styleForTemplate(value: string | undefined): VisualStyle {
  if (value === "editorial-white") return "editorial";
  if (value === "cinematic") return "cinematic";
  if (value === "verse-connection") return "verse";
  if (value === "manifesto") return "manifesto";
  return "street";
}

function fitClass(text: string) {
  const length = text.replace(/\s+/g, " ").trim().length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (length > 105 || words > 16) return "fit-xxl";
  if (length > 78 || words > 12) return "fit-xl";
  if (length > 54 || words > 9) return "fit-lg";
  if (length > 34 || words > 6) return "fit-md";
  return "fit-sm";
}

function readSnapshots(root: HTMLElement): Snapshot[] {
  const hidden = [...root.querySelectorAll<HTMLElement>(".creative-render-stage > .creative-frame-preview")];
  const total = Math.max(1, hidden.length);
  return [...root.querySelectorAll<HTMLElement>(".creative-frame-preview")].map((node, index) => {
    const eyebrow = node.querySelector<HTMLElement>(":scope > .creative-preview-eyebrow")?.textContent?.trim() || "Apostolic Guide";
    const numberMatch = eyebrow.match(/(?:·|\s)(\d{1,2})$/);
    const pathway = eyebrow.replace(/\s*·\s*\d{1,2}\s*$/, "").trim() || "Apostolic Guide";
    const format = node.classList.contains("is-story") ? "story" : node.classList.contains("is-single") ? "single" : "carousel";
    return {
      node,
      order: Number(numberMatch?.[1] || (index % total) + 1),
      total,
      pathway,
      title: node.querySelector<HTMLElement>(":scope > .creative-preview-copy > h2")?.textContent?.trim() || "Untitled frame",
      scripture: node.querySelector<HTMLElement>(":scope > .creative-preview-copy > .creative-preview-scripture")?.textContent?.trim() || "",
      body: node.querySelector<HTMLElement>(":scope > .creative-preview-copy > p")?.textContent?.trim() || "",
      overlay: node.querySelector<HTMLElement>(":scope > .creative-preview-copy > blockquote")?.textContent?.trim() || "",
      cta: node.querySelector<HTMLElement>(":scope > .creative-preview-cta")?.textContent?.trim() || "",
      format
    };
  });
}

function OriginalArtwork({ frame, visualStyle, alignment }: { frame: Snapshot; visualStyle: VisualStyle; alignment: "left" | "center" | "right" }) {
  const lightSurface = visualStyle === "editorial" || visualStyle === "verse";
  const logo = lightSurface ? "/brand/apostolic-guide-mark.png" : "/brand/apostolic-guide-mark-reversed.png";
  const kind = frame.order === 1 ? "cover" : frame.cta || frame.order === frame.total ? "cta" : frame.scripture ? "scripture" : "statement";
  const artStyle = {
    "--carousel-grain": .62,
    "--copy-y": kind === "cover" ? "49%" : "50%",
    "--headline-scale": 1,
    "--body-scale": 1,
    "--body-width": visualStyle === "editorial" ? "82%" : "76%",
    "--title-width": "90%",
    "--copy-align": alignment,
    "--copy-gap": "2.4cqw"
  } as React.CSSProperties;

  return <div className={`persistent-carousel-artboard carousel-artboard is-${visualStyle} is-${kind} ${frame.format === "story" ? "is-vertical" : "is-portrait"}`}>
    <div className="carousel-artwork" style={artStyle}>
      <div className="carousel-ambient carousel-ambient-red"/>
      <div className="carousel-grain"/>
      <div className="carousel-city"/>
      <img className="carousel-brand-mark" src={logo} alt=""/>
      <div className="carousel-pathway-label">SCRIPTURE PATHWAY</div>
      <div className="carousel-copy">
        <span>{frame.scripture ? frame.scripture : frame.pathway}</span>
        <strong className={fitClass(frame.title)}>{frame.title}</strong>
        {frame.body ? <p>{frame.body}</p> : frame.overlay ? <p>{frame.overlay}</p> : null}
        {frame.overlay && frame.body ? <em>{frame.overlay}</em> : null}
        {frame.cta ? <em>{frame.cta}</em> : null}
      </div>
      <div className="carousel-footer"><span>APOSTOLICGUIDE.COM</span><span>{String(frame.order).padStart(2, "0")} / {String(frame.total).padStart(2, "0")}</span></div>
    </div>
  </div>;
}

export function CarouselPersistentArtwork() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [frames, setFrames] = useState<Snapshot[]>([]);
  const [template, setTemplate] = useState("street-theology");
  const [alignment, setAlignment] = useState<"left" | "center" | "right">("center");
  const [signature, setSignature] = useState("");

  useEffect(() => {
    const current = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
    setRoot(current);
    if (!current) return;
    let scheduled = 0;
    const sync = () => {
      window.clearTimeout(scheduled);
      scheduled = window.setTimeout(() => {
        const next = readSnapshots(current);
        const templateValue = current.dataset.creativeTemplate || "street-theology";
        const alignmentSelect = [...current.querySelectorAll<HTMLSelectElement>(".creative-visual-controls select")].find((item) => ["left", "center", "right"].includes(item.value));
        const nextAlignment = (alignmentSelect?.value || (templateValue === "editorial-white" || templateValue === "verse-connection" ? "left" : "center")) as "left" | "center" | "right";
        const nextSignature = JSON.stringify({ templateValue, nextAlignment, frames: next.map((frame) => [frame.order, frame.total, frame.pathway, frame.title, frame.scripture, frame.body, frame.overlay, frame.cta, frame.format]) });
        setSignature((previous) => {
          if (previous === nextSignature) return previous;
          setFrames(next);
          setTemplate(templateValue);
          setAlignment(nextAlignment);
          return nextSignature;
        });
      }, 25);
    };
    sync();
    document.addEventListener("change", sync, true);
    document.addEventListener("input", sync, true);
    const observer = new MutationObserver(sync);
    observer.observe(current, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-creative-template", "class"] });
    return () => {
      window.clearTimeout(scheduled);
      document.removeEventListener("change", sync, true);
      document.removeEventListener("input", sync, true);
      observer.disconnect();
    };
  }, []);

  const style = useMemo(() => styleForTemplate(template), [template]);
  if (!root || !signature) return null;
  return <>{frames.map((frame, index) => createPortal(<OriginalArtwork frame={frame} visualStyle={style} alignment={alignment}/>, frame.node, `persistent-artwork-${index}-${frame.order}`))}</>;
}

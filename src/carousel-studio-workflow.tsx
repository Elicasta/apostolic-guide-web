"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, FolderOpen, Loader2, Save, Sparkles } from "lucide-react";
import { toPng } from "html-to-image";
import { PathwayAssetLibrary } from "@/pathway-asset-library";

type CreationType = "carousel" | "single-post" | "story" | "thumbnail";
type CaptionCopy = { caption: string; shortCaption: string; storyCopy: string; altText: string; hook: string; cta: string };
type CapturedSlide = { index: number; kind: string; eyebrow: string; title: string; body: string; reference: string; secondaryReference: string; width: number; height: number };

const STEPS = [
  ["Pathway", "Choose source + format"],
  ["Create", "Direct Sol"],
  ["Design", "Edit + doctrine"],
  ["Copy", "Caption + metadata"],
  ["Assets", "Save + export"]
] as const;

const CREATIONS: Record<CreationType, { label: string; description: string; outputLabel: string }> = {
  carousel: { label: "Carousel", description: "Sequential 4:5 swipe teaching.", outputLabel: "Instagram Carousel" },
  "single-post": { label: "Single Post", description: "One complete 4:5 graphic.", outputLabel: "Instagram Post" },
  story: { label: "Stories", description: "Sequential 9:16 story frames.", outputLabel: "Story" },
  thumbnail: { label: "Thumbnail", description: "YouTube / video cover concept.", outputLabel: "YouTube Thumbnail" }
};

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function cleanPrompt(value: string) {
  return value.replace(/^\[AG_CREATION_TYPE:[^\]]+\]\s*/i, "").replace(/^\[AG_TARGET_FRAMES:\d+\]\s*/i, "").trimStart();
}

function readContext() {
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".carousel-sourcebar select"));
  const pathway = selects[0];
  const mode = selects[1];
  return {
    pathwaySlug: pathway?.value || "",
    pathwayTitle: pathway?.selectedOptions?.[0]?.textContent?.trim() || "Pathway",
    mode: mode?.value || "pathway",
    prompt: document.querySelector<HTMLTextAreaElement>(".carousel-ai-brief textarea")?.value || ""
  };
}

function captureSlides(): CapturedSlide[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".carousel-export-artboard")).map((board, index) => {
    const kind = ["cover","scripture","statement","connection","cta"].find((value) => board.classList.contains(`is-${value}`)) || "statement";
    const copy = board.querySelector<HTMLElement>(".carousel-copy");
    const connection = board.querySelector<HTMLElement>(".carousel-verse-connection");
    const title = copy?.querySelector<HTMLElement>(":scope > strong")?.innerText?.replace(/\s+/g, " ").trim()
      || connection?.querySelectorAll<HTMLElement>(":scope > strong")?.[0]?.innerText?.trim()
      || "";
    const body = copy?.querySelector<HTMLElement>(":scope > p")?.innerText?.trim() || connection?.querySelector<HTMLElement>(":scope > p")?.innerText?.trim() || "";
    const reference = copy?.querySelector<HTMLElement>(":scope > em")?.innerText?.trim() || connection?.querySelectorAll<HTMLElement>(":scope > strong")?.[0]?.innerText?.trim() || "";
    const secondaryReference = connection?.querySelectorAll<HTMLElement>(":scope > strong")?.[1]?.innerText?.trim() || "";
    const eyebrow = copy?.querySelector<HTMLElement>(":scope > span")?.innerText?.trim() || connection?.querySelector<HTMLElement>(":scope > span")?.innerText?.trim() || "";
    return {
      index: index + 1,
      kind,
      eyebrow,
      title,
      body,
      reference,
      secondaryReference,
      width: Number.parseInt(board.style.width || "1080", 10) || 1080,
      height: Number.parseInt(board.style.height || "1350", 10) || 1350
    };
  });
}

export function CarouselStudioWorkflow({ aiReady }: { aiReady: boolean }) {
  const [page, setPage] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState(0);
  const [creationType, setCreationType] = useState<CreationType>("carousel");
  const [pathwaySlug, setPathwaySlug] = useState("");
  const [pathwayTitle, setPathwayTitle] = useState("Pathway");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [ctaKeyword, setCtaKeyword] = useState("");
  const [copy, setCopy] = useState<CaptionCopy | null>(null);
  const [parentAssetId, setParentAssetId] = useState<string | null>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".carousel-studio-page");
    setPage(root);
    if (!root) return;
    const sync = () => {
      const context = readContext();
      setPathwaySlug(context.pathwaySlug);
      setPathwayTitle(context.pathwayTitle);
    };
    sync();
    document.addEventListener("change", sync, true);
    return () => document.removeEventListener("change", sync, true);
  }, []);

  useEffect(() => {
    if (!page) return;
    page.dataset.workflowStage = String(stage);
  }, [page, stage]);

  function chooseCreation(next: CreationType) {
    setCreationType(next);
    setParentAssetId(null);
    setCopy(null);
    const outputButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".carousel-output-option"));
    outputButtons.find((button) => button.innerText.includes(CREATIONS[next].outputLabel))?.click();
    const prompt = document.querySelector<HTMLTextAreaElement>(".carousel-ai-brief textarea");
    if (prompt) {
      const base = cleanPrompt(prompt.value);
      const target = next === "story" ? "[AG_TARGET_FRAMES:4]\n" : "";
      setNativeValue(prompt, `[AG_CREATION_TYPE:${next}]\n${target}${base}`);
    }
  }

  const captured = useMemo(() => stage >= 3 ? captureSlides() : [], [stage, pathwaySlug, creationType]);

  async function generateCaption() {
    if (!pathwaySlug) return;
    setBusy("caption");
    setMessage("Sol is writing the caption and accessibility copy…");
    try {
      const context = readContext();
      const slides = captureSlides();
      const response = await fetch("/api/admin/pathway-assets/caption", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pathwaySlug, creationType: creationType === "thumbnail" ? "thumbnail" : creationType, title: pathwayTitle, prompt: cleanPrompt(context.prompt), slides, ctaKeyword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Caption generation failed.");
      setCopy(data.copy as CaptionCopy);
      setMessage("Copy ready. Edit anything before saving it to the Pathway folder.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Caption generation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveCaption() {
    if (!copy || !pathwaySlug) return;
    setBusy("save-caption");
    try {
      const response = await fetch("/api/admin/pathway-assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pathwaySlug, studio: "carousel", assetType: "caption", parentAssetId, title: `${pathwayTitle} ${CREATIONS[creationType].label} caption`, status: "draft", sourceType: "sol", editable: true, content: copy, metadata: { creationType, ctaKeyword } })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Caption could not be saved.");
      setMessage("Caption saved as its own editable Pathway asset.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Caption could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function saveCreativeSet() {
    if (!pathwaySlug) return;
    const boards = Array.from(document.querySelectorAll<HTMLElement>(".carousel-export-artboard"));
    if (!boards.length) return setMessage("Nothing is ready to save yet.");
    setBusy("save-set");
    setMessage("Saving editable source and individual assets to the Pathway folder…");
    try {
      const context = readContext();
      const slides = captureSlides();
      const styleButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".carousel-style-tabs button")).find((button) => button.classList.contains("is-active"));
      const topType = creationType === "carousel" ? "carousel-deck" : creationType === "story" ? "story-set" : creationType === "single-post" ? "single-post" : "thumbnail";
      const parentResponse = await fetch("/api/admin/pathway-assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(parentAssetId ? { id: parentAssetId } : {}),
          pathwaySlug,
          studio: "carousel",
          assetType: topType,
          title: `${pathwayTitle} · ${CREATIONS[creationType].label}`,
          status: "draft",
          sourceType: "sol",
          editable: true,
          content: { creationType, mode: context.mode, prompt: cleanPrompt(context.prompt), visualStyle: styleButton?.innerText?.split("\n")[0] || "", slides },
          metadata: { childCount: slides.length, savedFrom: "carousel-studio" }
        })
      });
      const parentData = await parentResponse.json().catch(() => ({}));
      if (!parentResponse.ok) throw new Error(parentData.error || "Creative set could not be saved.");
      const parentId = String(parentData.asset.id);
      setParentAssetId(parentId);

      for (let index = 0; index < boards.length; index += 1) {
        const board = boards[index];
        const slide = slides[index];
        const dataUrl = await toPng(board, { width: slide.width, height: slide.height, pixelRatio: 1, cacheBust: true });
        const childType = creationType === "carousel" ? "carousel-slide" : creationType === "story" ? "story-frame" : creationType === "single-post" ? "single-post" : "thumbnail";
        const childResponse = await fetch("/api/admin/pathway-assets/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pathwaySlug, studio: "carousel", assetType: childType, parentAssetId: parentId, title: `${pathwayTitle} · ${CREATIONS[creationType].label} ${String(index + 1).padStart(2, "0")}`, dataUrl, sourceType: "generated", content: slide, metadata: { creationType, parentVersion: Number(parentData.asset.version || 1), slideIndex: index + 1 } })
        });
        const childData = await childResponse.json().catch(() => ({}));
        if (!childResponse.ok) throw new Error(childData.error || `Asset ${index + 1} could not be saved.`);
      }
      setMessage(`${slides.length} individual asset${slides.length === 1 ? "" : "s"} + editable source saved under ${pathwayTitle}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Creative set could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  if (!page) return null;

  const nav = createPortal(<>
    <nav className="carousel-workflow-nav" aria-label="Carousel Studio workflow">{STEPS.map(([label, description], index) => <button type="button" key={label} className={stage === index ? "is-active" : ""} onClick={() => setStage(index)}><i>{index + 1}</i><span><strong>{label}</strong><span>{description}</span></span></button>)}</nav>
    {message ? <div className="admin-notice carousel-workflow-message">{message}</div> : null}
  </>, page.querySelector(".carousel-studio-heading")?.parentElement || page);

  const module = createPortal(<>
    {stage === 0 ? <section className="admin-card carousel-workflow-custom carousel-creation-module">
      <div className="carousel-card-heading"><div><span className="section-kicker">What are we making?</span><h2>Choose the content type</h2></div><span>{pathwayTitle}</span></div>
      <div className="carousel-creation-picker">{(Object.keys(CREATIONS) as CreationType[]).map((key) => <button type="button" key={key} className={creationType === key ? "is-active" : ""} onClick={() => chooseCreation(key)}><strong>{CREATIONS[key].label}</strong><span>{CREATIONS[key].description}</span></button>)}</div>
    </section> : null}

    {stage === 3 ? <section className="admin-card carousel-workflow-custom carousel-caption-desk">
      <div className="carousel-card-heading"><div><span className="section-kicker">Sol copy desk</span><h2>Caption + metadata</h2></div><span>{CREATIONS[creationType].label}</span></div>
      <div className="carousel-caption-grid"><label><span>Comment keyword, if this post uses one</span><input value={ctaKeyword} onChange={(event) => setCtaKeyword(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30))} placeholder="JESUS"/></label><div className="carousel-caption-actions"><button type="button" className="button primary" disabled={!aiReady || Boolean(busy)} onClick={() => void generateCaption()}>{busy === "caption" ? <Loader2 className="spin" size={15}/> : <Sparkles size={15}/>} Generate with Sol</button>{copy ? <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void saveCaption()}>{busy === "save-caption" ? <Loader2 className="spin" size={15}/> : <Save size={15}/>} Save copy asset</button> : null}</div></div>
      {copy ? <div className="carousel-caption-copy">
        <article className="is-wide"><span>Caption</span><textarea rows={9} value={copy.caption} onChange={(event) => setCopy({ ...copy, caption: event.target.value })}/></article>
        <article><span>Short caption</span><textarea rows={5} value={copy.shortCaption} onChange={(event) => setCopy({ ...copy, shortCaption: event.target.value })}/></article>
        <article><span>Story copy</span><textarea rows={5} value={copy.storyCopy} onChange={(event) => setCopy({ ...copy, storyCopy: event.target.value })}/></article>
        <article><span>Alt text</span><textarea rows={5} value={copy.altText} onChange={(event) => setCopy({ ...copy, altText: event.target.value })}/></article>
        <article><span>CTA</span><textarea rows={5} value={copy.cta} onChange={(event) => setCopy({ ...copy, cta: event.target.value })}/></article>
      </div> : <div className="studio-empty-state compact"><strong>Copy stays attached to the creative</strong><p>Generate after the graphics are settled so Sol can write from the actual final sequence.</p></div>}
    </section> : null}

    {stage === 4 ? <>
      <section className="admin-card carousel-workflow-custom"><div className="carousel-card-heading"><div><span className="section-kicker">Editable source</span><h2>Save this creative to {pathwayTitle}</h2></div><span>{captured.length} asset{captured.length === 1 ? "" : "s"}</span></div><p>Save keeps the structured source and also stores every slide/frame/post as its own Pathway asset. Saving again versions the parent source instead of replacing its history.</p><button type="button" className="button primary" disabled={Boolean(busy)} onClick={() => void saveCreativeSet()}>{busy === "save-set" ? <Loader2 className="spin" size={15}/> : <FolderOpen size={15}/>} Save creative + individual assets</button></section>
      <PathwayAssetLibrary pathwaySlug={pathwaySlug} pathwayTitle={pathwayTitle} studio="carousel" aiReady={aiReady}/>
    </> : null}

    <div className="carousel-workflow-footer">
      <button type="button" className="button" disabled={stage === 0} onClick={() => setStage((value) => Math.max(0, value - 1))}><ChevronLeft size={15}/> Back</button>
      <button type="button" className="button primary" disabled={stage === STEPS.length - 1} onClick={() => setStage((value) => Math.min(STEPS.length - 1, value + 1))}>Next <ChevronRight size={15}/></button>
    </div>
  </>, page);

  return <>{nav}{module}</>;
}

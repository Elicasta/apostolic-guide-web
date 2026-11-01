"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import { AG_CAROUSEL_COLORS, MODE_STYLE_DEFAULTS, type CarouselMode, type CarouselVisualStyle } from "@/carousel-design-rules";

type FontChoice = "Montserrat" | "Bebas Neue" | "Cormorant Garamond";
type EditLayer = "headline" | "body";
type BrandColorKey = "paper" | "white" | "ink" | "ink2" | "crimson" | "blue" | "blueSoft";
type BackgroundMode = "auto" | "texture" | "image" | "none";

type BrandEdit = {
  headlineFont: FontChoice;
  bodyFont: FontChoice;
  headlineColor: BrandColorKey;
  bodyColor: BrandColorKey;
};

type BackgroundRecommendation = {
  mode: "texture" | "image" | "none";
  reason: string;
  prompt: string;
  overlay: number;
};

type BackgroundEdit = {
  mode: BackgroundMode;
  recommendation?: BackgroundRecommendation;
  prompt: string;
  overlay: number;
};

const FONT_CHOICES: FontChoice[] = ["Montserrat", "Bebas Neue", "Cormorant Garamond"];
const COLOR_LABELS: Record<BrandColorKey, string> = {
  paper: "Brand white",
  white: "White",
  ink: "Ink",
  ink2: "Slate ink",
  crimson: "Crimson",
  blue: "AG blue",
  blueSoft: "Blue soft"
};
const COLOR_KEYS = Object.keys(COLOR_LABELS) as BrandColorKey[];
const STYLE_INDEX: Record<CarouselVisualStyle, number> = { street: 0, editorial: 1, cinematic: 2, verse: 3, manifesto: 4 };

function readStyle(): CarouselVisualStyle {
  const board = document.querySelector<HTMLElement>(".carousel-artboard");
  if (board?.classList.contains("is-editorial")) return "editorial";
  if (board?.classList.contains("is-cinematic")) return "cinematic";
  if (board?.classList.contains("is-verse")) return "verse";
  if (board?.classList.contains("is-manifesto")) return "manifesto";
  return "street";
}

function readSlidePosition() {
  const label = document.querySelector<HTMLElement>(".carousel-preview-nav strong")?.innerText?.trim() ?? "01 / 01";
  const match = label.match(/(\d+)\s*\/\s*(\d+)/);
  return { slide: Number(match?.[1] ?? 1), total: Number(match?.[2] ?? 1) };
}

function readDeckKey() {
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".carousel-sourcebar select"));
  const source = selects[0]?.value || "carousel";
  const mode = selects[1]?.value || "pathway";
  return `${source}:${mode}`;
}

function readSlideCopy() {
  const board = document.querySelector<HTMLElement>(".carousel-artboard");
  if (!board) return { kind: "statement", title: "", body: "", reference: "", secondaryReference: "" };
  const kind = ["cover", "scripture", "statement", "connection", "cta"].find((value) => board.classList.contains(`is-${value}`)) ?? "statement";
  const title = board.querySelector<HTMLElement>(".carousel-copy > strong, .carousel-verse-connection > strong")?.innerText?.trim() ?? "";
  const body = board.querySelector<HTMLElement>(".carousel-copy > p, .carousel-verse-connection > p")?.innerText?.trim() ?? "";
  const refs = Array.from(board.querySelectorAll<HTMLElement>(".carousel-verse-connection > strong"));
  const reference = refs[0]?.innerText?.trim() || board.querySelector<HTMLElement>(".carousel-copy > em")?.innerText?.trim() || "";
  const secondaryReference = refs[1]?.innerText?.trim() || "";
  return { kind, title, body, reference, secondaryReference };
}

function fontStack(font: FontChoice) {
  if (font === "Bebas Neue") return "'Bebas Neue','Montserrat',Arial,sans-serif";
  if (font === "Cormorant Garamond") return "'Cormorant Garamond',Georgia,serif";
  return "'Montserrat',Arial,sans-serif";
}

function defaultBrandEdit(style: CarouselVisualStyle): BrandEdit {
  const light = style === "editorial" || style === "verse";
  if (style === "verse") return { headlineFont: "Bebas Neue", bodyFont: "Montserrat", headlineColor: "ink", bodyColor: "ink2" };
  if (style === "editorial") return { headlineFont: "Cormorant Garamond", bodyFont: "Montserrat", headlineColor: "ink", bodyColor: "ink2" };
  if (style === "cinematic") return { headlineFont: "Cormorant Garamond", bodyFont: "Montserrat", headlineColor: "paper", bodyColor: "blueSoft" };
  return { headlineFont: "Montserrat", bodyFont: "Montserrat", headlineColor: light ? "ink" : "paper", bodyColor: light ? "ink2" : "blueSoft" };
}

function isLightSurface(style: CarouselVisualStyle, bgMode: BackgroundMode, recommendation?: BackgroundRecommendation) {
  if (bgMode === "image") return false;
  if (bgMode === "auto" && recommendation?.mode === "image") return false;
  return style === "editorial" || style === "verse";
}

function allowedColorKeys(lightSurface: boolean): BrandColorKey[] {
  return lightSurface ? ["ink", "ink2", "crimson", "blue"] : ["paper", "white", "blueSoft"];
}

function brandStorageKey(deck: string, style: CarouselVisualStyle, slide: number) {
  return `ag-carousel-brand-edit-v1:${deck}:${style}:${slide}`;
}

function backgroundStorageKey(deck: string, style: CarouselVisualStyle, slide: number) {
  return `ag-carousel-background-v1:${deck}:${style}:${slide}`;
}

function loadBrandEdit(deck: string, style: CarouselVisualStyle, slide: number): BrandEdit {
  try {
    const saved = localStorage.getItem(brandStorageKey(deck, style, slide));
    if (saved) return { ...defaultBrandEdit(style), ...(JSON.parse(saved) as Partial<BrandEdit>) };
  } catch {}
  return defaultBrandEdit(style);
}

function loadBackgroundEdit(deck: string, style: CarouselVisualStyle, slide: number): BackgroundEdit {
  try {
    const saved = localStorage.getItem(backgroundStorageKey(deck, style, slide));
    if (saved) return { mode: "auto", prompt: "", overlay: 48, ...(JSON.parse(saved) as Partial<BackgroundEdit>) };
  } catch {}
  return { mode: "auto", prompt: "", overlay: 48 };
}

function applyBrand(board: HTMLElement | null | undefined, edit: BrandEdit) {
  if (!board) return;
  board.style.setProperty("--manual-headline-font", fontStack(edit.headlineFont));
  board.style.setProperty("--manual-body-font", fontStack(edit.bodyFont));
  board.style.setProperty("--manual-headline-color", AG_CAROUSEL_COLORS[edit.headlineColor]);
  board.style.setProperty("--manual-body-color", AG_CAROUSEL_COLORS[edit.bodyColor]);
}

function applyBackground(board: HTMLElement | null | undefined, edit: BackgroundEdit, imageDataUrl?: string) {
  if (!board) return;
  const resolved = edit.mode === "auto" ? (edit.recommendation?.mode ?? "texture") : edit.mode;
  board.dataset.bgMode = resolved;
  board.style.setProperty("--generated-bg-overlay", String(Math.max(0, Math.min(80, edit.overlay)) / 100));
  if (resolved === "image" && imageDataUrl) board.style.setProperty("--generated-bg-image", `url(${JSON.stringify(imageDataUrl)})`);
  else board.style.removeProperty("--generated-bg-image");
}

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export function CarouselStudioEnhancements({ aiReady }: { aiReady: boolean }) {
  const [manualTarget, setManualTarget] = useState<Element | null>(null);
  const [previewTarget, setPreviewTarget] = useState<Element | null>(null);
  const [mobileModeTarget, setMobileModeTarget] = useState<Element | null>(null);
  const [style, setStyle] = useState<CarouselVisualStyle>("street");
  const [deck, setDeck] = useState("carousel:pathway");
  const [slide, setSlide] = useState(1);
  const [total, setTotal] = useState(1);
  const [layer, setLayer] = useState<EditLayer>("headline");
  const [brandEdit, setBrandEdit] = useState<BrandEdit>(defaultBrandEdit("street"));
  const [backgroundEdit, setBackgroundEdit] = useState<BackgroundEdit>({ mode: "auto", prompt: "", overlay: 48 });
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [backgroundBusy, setBackgroundBusy] = useState<"direct" | "generate" | null>(null);
  const [backgroundMessage, setBackgroundMessage] = useState("AI checks whether this slide benefits from an image, a texture, or a clean surface.");
  const imageKey = `${deck}:${style}:${slide}`;

  const lightSurface = isLightSurface(style, backgroundEdit.mode, backgroundEdit.recommendation);
  const safeColors = useMemo(() => allowedColorKeys(lightSurface), [lightSurface]);

  useEffect(() => {
    let disposed = false;
    const sync = () => {
      if (disposed) return;
      const board = document.querySelector<HTMLElement>(".carousel-artboard");
      const nextStyle = readStyle();
      const position = readSlidePosition();
      const nextDeck = readDeckKey();
      setStyle(nextStyle);
      setSlide(position.slide);
      setTotal(position.total);
      setDeck(nextDeck);
      setManualTarget(document.querySelector(".carousel-manual-panel"));
      setPreviewTarget(document.querySelector(".carousel-preview-card"));
      setMobileModeTarget(document.querySelector(".carousel-sourcebar label:nth-child(2)"));
      const nextBrand = loadBrandEdit(nextDeck, nextStyle, position.slide);
      const nextBackground = loadBackgroundEdit(nextDeck, nextStyle, position.slide);
      setBrandEdit(nextBrand);
      setBackgroundEdit(nextBackground);
      applyBrand(board, nextBrand);
      applyBackground(board, nextBackground, imageUrls[`${nextDeck}:${nextStyle}:${position.slide}`]);
      const exports = Array.from(document.querySelectorAll<HTMLElement>(".carousel-export-artboard"));
      exports.forEach((exportBoard, index) => {
        const indexSlide = index + 1;
        const savedBrand = loadBrandEdit(nextDeck, nextStyle, indexSlide);
        const savedBackground = loadBackgroundEdit(nextDeck, nextStyle, indexSlide);
        applyBrand(exportBoard, savedBrand);
        applyBackground(exportBoard, savedBackground, imageUrls[`${nextDeck}:${nextStyle}:${indexSlide}`]);
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    return () => { disposed = true; observer.disconnect(); };
  }, [imageUrls]);

  useEffect(() => {
    try { localStorage.setItem(brandStorageKey(deck, style, slide), JSON.stringify(brandEdit)); } catch {}
    applyBrand(document.querySelector<HTMLElement>(".carousel-artboard"), brandEdit);
    const exports = Array.from(document.querySelectorAll<HTMLElement>(".carousel-export-artboard"));
    applyBrand(exports[slide - 1], brandEdit);
  }, [brandEdit, deck, slide, style]);

  useEffect(() => {
    try { localStorage.setItem(backgroundStorageKey(deck, style, slide), JSON.stringify(backgroundEdit)); } catch {}
    applyBackground(document.querySelector<HTMLElement>(".carousel-artboard"), backgroundEdit, imageUrls[imageKey]);
    const exports = Array.from(document.querySelectorAll<HTMLElement>(".carousel-export-artboard"));
    applyBackground(exports[slide - 1], backgroundEdit, imageUrls[imageKey]);
  }, [backgroundEdit, deck, imageKey, imageUrls, slide, style]);

  useEffect(() => {
    if (!aiReady || backgroundEdit.recommendation || backgroundBusy) return;
    const timer = window.setTimeout(() => void directBackground(true), 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiReady, deck, slide, style]);

  function updateLayerFont(font: FontChoice) {
    setBrandEdit((current) => layer === "headline" ? { ...current, headlineFont: font } : { ...current, bodyFont: font });
  }

  function updateLayerColor(color: BrandColorKey) {
    if (!safeColors.includes(color)) return;
    setBrandEdit((current) => layer === "headline" ? { ...current, headlineColor: color } : { ...current, bodyColor: color });
  }

  function normalizeColorsForSurface(next: BackgroundEdit) {
    const light = isLightSurface(style, next.mode, next.recommendation);
    const allowed = allowedColorKeys(light);
    setBrandEdit((current) => ({
      ...current,
      headlineColor: allowed.includes(current.headlineColor) ? current.headlineColor : (light ? "ink" : "paper"),
      bodyColor: allowed.includes(current.bodyColor) ? current.bodyColor : (light ? "ink2" : "blueSoft")
    }));
  }

  async function directBackground(silent = false) {
    if (!aiReady || backgroundBusy) return;
    setBackgroundBusy("direct");
    if (!silent) setBackgroundMessage("AI is deciding whether this slide needs an image, texture, or clean surface…");
    try {
      const copy = readSlideCopy();
      const response = await fetch("/api/admin/carousel-studio/background-direct", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ style, slideNumber: slide, totalSlides: total, ...copy })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.direction) throw new Error(data.error || "Background direction failed.");
      const direction = data.direction as BackgroundRecommendation;
      const next = { ...backgroundEdit, recommendation: direction, prompt: backgroundEdit.prompt || direction.prompt, overlay: direction.overlay };
      setBackgroundEdit(next);
      normalizeColorsForSurface(next);
      setBackgroundMessage(direction.reason);
    } catch (error) {
      if (!silent) setBackgroundMessage(error instanceof Error ? error.message : "Background direction failed.");
    } finally {
      setBackgroundBusy(null);
    }
  }

  async function generateBackground() {
    if (!aiReady || backgroundBusy) return;
    const prompt = backgroundEdit.prompt.trim() || backgroundEdit.recommendation?.prompt?.trim();
    if (!prompt) return;
    setBackgroundBusy("generate");
    setBackgroundMessage("Generating a text-free background image with protected copy space…");
    try {
      const board = document.querySelector<HTMLElement>(".carousel-artboard");
      const orientation = board?.classList.contains("is-landscape") ? "landscape" : "portrait";
      const response = await fetch("/api/admin/carousel-studio/background-generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ style, prompt, orientation })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.dataUrl) throw new Error(data.error || "Background image generation failed.");
      setImageUrls((current) => ({ ...current, [imageKey]: data.dataUrl as string }));
      const next = { ...backgroundEdit, mode: "image" as const };
      setBackgroundEdit(next);
      normalizeColorsForSurface(next);
      setBackgroundMessage("Background generated. Typography remains HTML/CSS so the text stays exact and editable.");
    } catch (error) {
      setBackgroundMessage(error instanceof Error ? error.message : "Background image generation failed.");
    } finally {
      setBackgroundBusy(null);
    }
  }

  const manualControls = manualTarget ? createPortal(
    <div className="carousel-brand-manual" aria-label="Brand typography and color controls">
      <div className="carousel-brand-manual-heading"><strong>Brand typography + color</strong><small>Slide {String(slide).padStart(2, "0")} only · contrast-safe</small></div>
      <div className="carousel-brand-layer-tabs">
        <button type="button" className={layer === "headline" ? "is-active" : ""} onClick={() => setLayer("headline")}>Headline / references</button>
        <button type="button" className={layer === "body" ? "is-active" : ""} onClick={() => setLayer("body")}>Body</button>
      </div>
      <div className="carousel-brand-fonts" role="group" aria-label="Brand fonts">
        {FONT_CHOICES.map((font) => {
          const activeFont = layer === "headline" ? brandEdit.headlineFont : brandEdit.bodyFont;
          return <button type="button" key={font} className={activeFont === font ? "is-active" : ""} data-font={font} onClick={() => updateLayerFont(font)}>{font}</button>;
        })}
      </div>
      <div className="carousel-brand-palette" role="group" aria-label="Brand color palette">
        {COLOR_KEYS.map((key) => {
          const activeColor = layer === "headline" ? brandEdit.headlineColor : brandEdit.bodyColor;
          const enabled = safeColors.includes(key);
          return <button type="button" key={key} className={activeColor === key ? "is-active" : ""} disabled={!enabled} title={enabled ? COLOR_LABELS[key] : `${COLOR_LABELS[key]} does not meet the contrast rule on this surface`} aria-label={COLOR_LABELS[key]} onClick={() => updateLayerColor(key)}><i style={{ background: AG_CAROUSEL_COLORS[key] }}/><span>{COLOR_LABELS[key]}</span></button>;
        })}
      </div>
    </div>,
    manualTarget
  ) : null;

  const backgroundControls = previewTarget ? createPortal(
    <section className="carousel-background-director" aria-label="AI background direction">
      <div className="carousel-background-heading">
        <div><span>Visual background</span><strong>Texture or image?</strong></div>
        <small>Slide {String(slide).padStart(2, "0")} / {String(total).padStart(2, "0")}</small>
      </div>
      <div className="carousel-background-modes">
        {(["auto", "texture", "image", "none"] as BackgroundMode[]).map((mode) => <button type="button" key={mode} className={backgroundEdit.mode === mode ? "is-active" : ""} onClick={() => { const next = { ...backgroundEdit, mode }; setBackgroundEdit(next); normalizeColorsForSurface(next); }}>{mode === "auto" ? "AI Auto" : mode === "image" ? "AI image" : mode}</button>)}
      </div>
      <div className={`carousel-background-recommendation is-${backgroundEdit.recommendation?.mode ?? "pending"}`}>
        <ImageIcon size={17}/>
        <div><strong>{backgroundEdit.recommendation ? `AI recommends ${backgroundEdit.recommendation.mode}` : backgroundBusy === "direct" ? "Evaluating slide…" : "Background logic ready"}</strong><p>{backgroundMessage}</p></div>
        <button type="button" className="button small" disabled={!aiReady || Boolean(backgroundBusy)} onClick={() => void directBackground(false)}>{backgroundBusy === "direct" ? <Loader2 className="spin" size={14}/> : <Sparkles size={14}/>} Recheck</button>
      </div>
      {(backgroundEdit.mode === "image" || backgroundEdit.recommendation?.mode === "image") ? <div className="carousel-background-generator">
        <label><span>Image direction</span><textarea rows={2} value={backgroundEdit.prompt} onChange={(event) => setBackgroundEdit((current) => ({ ...current, prompt: event.target.value }))} placeholder="AI fills this with a text-free background prompt."/></label>
        <label className="carousel-bg-overlay"><span>Readability overlay</span><input type="range" min="20" max="75" step="1" value={backgroundEdit.overlay} onChange={(event) => setBackgroundEdit((current) => ({ ...current, overlay: Number(event.target.value) }))}/><b>{backgroundEdit.overlay}%</b></label>
        <button type="button" className="button" disabled={!aiReady || Boolean(backgroundBusy) || !backgroundEdit.prompt.trim()} onClick={() => void generateBackground()}>{backgroundBusy === "generate" ? <Loader2 className="spin" size={15}/> : <ImageIcon size={15}/>} {imageUrls[imageKey] ? "Regenerate image" : "Generate background image"}</button>
      </div> : null}
    </section>,
    previewTarget
  ) : null;

  const mobileModePicker = mobileModeTarget ? createPortal(
    <div className="carousel-mobile-mode-picker" aria-label="Carousel type">
      {(Object.keys(MODE_STYLE_DEFAULTS) as CarouselMode[]).map((mode) => <button type="button" key={mode} onClick={() => {
        const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".carousel-sourcebar select"));
        if (selects[1]) setNativeSelectValue(selects[1], mode);
        const preferred = MODE_STYLE_DEFAULTS[mode];
        const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".carousel-style-tabs button"));
        tabs[STYLE_INDEX[preferred]]?.click();
      }}>{mode === "pathway" ? "Pathway Guide" : mode === "informational" ? "Informational" : mode === "word-study" ? "Word Study" : mode === "verse-connection" ? "Verse Connections" : "How to Use the App"}</button>)}
    </div>,
    mobileModeTarget
  ) : null;

  return <>{manualControls}{backgroundControls}{mobileModePicker}</>;
}

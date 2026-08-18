"use client";

import { createPortal } from "react-dom";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CAROUSEL_TEXTURES,
  STYLE_TEXTURE_DEFAULTS,
  type CarouselTextureId,
  type CarouselVisualStyle
} from "@/carousel-design-rules";

type Alignment = "left" | "center" | "right";

type SlideDesign = {
  copyY: number;
  headlineScale: number;
  titleWidth: number;
  bodyScale: number;
  bodyWidth: number;
  copyGap: number;
  alignment: Alignment;
  textColor: string | null;
  texture: CarouselTextureId;
  textureStrength: number;
};

type SlidePosition = { index: number; total: number };

const DARK_TEXT = "#f5f7f4";
const LIGHT_TEXT = "#10202a";

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function visualStyle(root: HTMLElement | null): CarouselVisualStyle {
  const template = root?.dataset.creativeTemplate;
  if (template === "editorial-white") return "editorial";
  if (template === "cinematic") return "cinematic";
  if (template === "verse-connection") return "verse";
  if (template === "manifesto") return "manifesto";
  return "street";
}

function defaultAlignment(style: CarouselVisualStyle): Alignment {
  return style === "editorial" || style === "verse" ? "left" : "center";
}

function defaultTextColor(style: CarouselVisualStyle) {
  return style === "editorial" || style === "verse" ? LIGHT_TEXT : DARK_TEXT;
}

function defaultDesign(style: CarouselVisualStyle): SlideDesign {
  const texture = STYLE_TEXTURE_DEFAULTS[style];
  return {
    copyY: 50,
    headlineScale: 1,
    titleWidth: 90,
    bodyScale: 1,
    bodyWidth: style === "editorial" ? 82 : 76,
    copyGap: 2.4,
    alignment: defaultAlignment(style),
    textColor: null,
    texture: texture.texture,
    textureStrength: texture.strength
  };
}

function storageKey(projectId: string, slideIndex: number) {
  return `ag-carousel-manual-design-v1:${projectId}:${slideIndex + 1}`;
}

function readDesign(projectId: string, slideIndex: number, style: CarouselVisualStyle): SlideDesign {
  const fallback = defaultDesign(style);
  try {
    const stored = window.localStorage.getItem(storageKey(projectId, slideIndex));
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<SlideDesign>;
    const texture = CAROUSEL_TEXTURES.some((item) => item.id === parsed.texture) ? parsed.texture as CarouselTextureId : fallback.texture;
    const alignment = parsed.alignment === "left" || parsed.alignment === "center" || parsed.alignment === "right" ? parsed.alignment : fallback.alignment;
    const color = typeof parsed.textColor === "string" && /^#[0-9a-f]{6}$/i.test(parsed.textColor) ? parsed.textColor : null;
    return {
      copyY: clamp(parsed.copyY, 32, 68, fallback.copyY),
      headlineScale: clamp(parsed.headlineScale, .55, 1.45, fallback.headlineScale),
      titleWidth: clamp(parsed.titleWidth, 48, 98, fallback.titleWidth),
      bodyScale: clamp(parsed.bodyScale, .65, 1.35, fallback.bodyScale),
      bodyWidth: clamp(parsed.bodyWidth, 45, 94, fallback.bodyWidth),
      copyGap: clamp(parsed.copyGap, .5, 5, fallback.copyGap),
      alignment,
      textColor: color,
      texture,
      textureStrength: clamp(parsed.textureStrength, 0, 70, fallback.textureStrength)
    };
  } catch {
    return fallback;
  }
}

function writeDesign(projectId: string, slideIndex: number, design: SlideDesign) {
  try {
    window.localStorage.setItem(storageKey(projectId, slideIndex), JSON.stringify(design));
  } catch {}
}

function currentSlide(root: HTMLElement | null): SlidePosition {
  if (!root) return { index: 0, total: 1 };
  const rows = [...root.querySelectorAll<HTMLElement>(".creative-frame-row")];
  const active = rows.findIndex((row) => row.classList.contains("is-active"));
  return { index: Math.max(0, active), total: Math.max(1, rows.length) };
}

function applyDesign(board: HTMLElement | null, design: SlideDesign) {
  if (!board) return;
  const artwork = board.querySelector<HTMLElement>(".carousel-artwork");
  if (!artwork) return;
  artwork.style.setProperty("--copy-y", `${design.copyY}%`);
  artwork.style.setProperty("--headline-scale", String(design.headlineScale));
  artwork.style.setProperty("--title-width", `${design.titleWidth}%`);
  artwork.style.setProperty("--body-scale", String(design.bodyScale));
  artwork.style.setProperty("--body-width", `${design.bodyWidth}%`);
  artwork.style.setProperty("--copy-gap", `${design.copyGap}cqw`);
  artwork.style.setProperty("--copy-align", design.alignment);
  board.dataset.texture = design.texture;
  board.style.setProperty("--texture-strength", String(design.textureStrength / 100));
  if (design.textColor) {
    board.dataset.manualTextColor = "true";
    board.style.setProperty("--manual-text-color", design.textColor);
  } else {
    delete board.dataset.manualTextColor;
    board.style.removeProperty("--manual-text-color");
  }
}

function RangeControl({ label, min, max, step, value, suffix = "%", onChange }: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return <label className="carousel-manual-design-range">
    <span>{label}<b>{Math.round(value)}{suffix}</b></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))}/>
  </label>;
}

export function CarouselManualDesignControls() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<SlidePosition>({ index: 0, total: 1 });
  const [style, setStyle] = useState<CarouselVisualStyle>("street");
  const [design, setDesign] = useState<SlideDesign>(() => defaultDesign("street"));

  const projectId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("project") || "";
  }, []);

  const applyEveryBoard = useCallback((activeDesign?: SlideDesign) => {
    if (!root || !projectId) return;
    const activePosition = currentSlide(root);
    const activeStyle = visualStyle(root);
    const visibleDesign = activeDesign ?? readDesign(projectId, activePosition.index, activeStyle);
    applyDesign(root.querySelector<HTMLElement>(".creative-preview-panel .persistent-carousel-artboard"), visibleDesign);

    const renderHosts = [...root.querySelectorAll<HTMLElement>(".creative-render-stage > .creative-frame-preview")];
    renderHosts.forEach((host, index) => {
      applyDesign(host.querySelector<HTMLElement>(".persistent-carousel-artboard"), readDesign(projectId, index, activeStyle));
    });
  }, [projectId, root]);

  useEffect(() => {
    const master = document.querySelector<HTMLElement>(".carousel-studio-master");
    if (!master || !projectId) return;
    let timer = 0;
    const sync = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const nextRoot = master.querySelector<HTMLElement>(".creative-studio-shell");
        if (!nextRoot) return;
        const nextTarget = nextRoot.querySelector<HTMLElement>(".creative-editor-panel");
        const nextPosition = currentSlide(nextRoot);
        const nextStyle = visualStyle(nextRoot);
        setRoot(nextRoot);
        setTarget(nextTarget);
        setPosition(nextPosition);
        setStyle(nextStyle);
        const nextDesign = readDesign(projectId, nextPosition.index, nextStyle);
        setDesign(nextDesign);
        window.setTimeout(() => {
          applyDesign(nextRoot.querySelector<HTMLElement>(".creative-preview-panel .persistent-carousel-artboard"), nextDesign);
          const renderHosts = [...nextRoot.querySelectorAll<HTMLElement>(".creative-render-stage > .creative-frame-preview")];
          renderHosts.forEach((host, index) => applyDesign(host.querySelector<HTMLElement>(".persistent-carousel-artboard"), readDesign(projectId, index, nextStyle)));
        }, 0);
      }, 25);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(master, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-creative-template"] });
    window.addEventListener("carousel-slide-change", sync as EventListener);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("carousel-slide-change", sync as EventListener);
    };
  }, [projectId]);

  useEffect(() => {
    if (!root || !projectId) return;
    writeDesign(projectId, position.index, design);
    applyEveryBoard(design);
  }, [applyEveryBoard, design, position.index, projectId, root]);

  function update(patch: Partial<SlideDesign>) {
    setDesign((current) => ({ ...current, ...patch }));
  }

  function resetSlide() {
    if (!projectId) return;
    try { window.localStorage.removeItem(storageKey(projectId, position.index)); } catch {}
    const next = defaultDesign(style);
    setDesign(next);
    applyEveryBoard(next);
  }

  function applyTextureToAll() {
    if (!projectId) return;
    for (let index = 0; index < position.total; index += 1) {
      const current = readDesign(projectId, index, style);
      writeDesign(projectId, index, { ...current, texture: design.texture, textureStrength: design.textureStrength });
    }
    applyEveryBoard(design);
  }

  if (!target || !projectId) return null;

  const resolvedColor = design.textColor || defaultTextColor(style);
  const texture = CAROUSEL_TEXTURES.find((item) => item.id === design.texture);

  return createPortal(<section className="carousel-manual-design-controls" aria-label="Manual slide design controls">
    <div className="carousel-manual-design-heading">
      <div><SlidersHorizontal size={16}/><span><strong>Slide styling</strong><small>Slide {position.index + 1} of {position.total} · saved on this device</small></span></div>
      <button type="button" onClick={resetSlide}><RotateCcw size={14}/> Reset</button>
    </div>

    <details open>
      <summary>Type + layout</summary>
      <div className="carousel-manual-design-grid">
        <RangeControl label="Position" min={32} max={68} step={1} value={design.copyY} onChange={(value) => update({ copyY: value })}/>
        <RangeControl label="Headline size" min={55} max={145} step={1} value={design.headlineScale * 100} onChange={(value) => update({ headlineScale: value / 100 })}/>
        <RangeControl label="Headline width" min={48} max={98} step={1} value={design.titleWidth} onChange={(value) => update({ titleWidth: value })}/>
        <RangeControl label="Body size" min={65} max={135} step={1} value={design.bodyScale * 100} onChange={(value) => update({ bodyScale: value / 100 })}/>
        <RangeControl label="Body width" min={45} max={94} step={1} value={design.bodyWidth} onChange={(value) => update({ bodyWidth: value })}/>
        <RangeControl label="Spacing" min={5} max={50} step={1} value={design.copyGap * 10} suffix="" onChange={(value) => update({ copyGap: value / 10 })}/>
        <label className="carousel-manual-design-field"><span>Alignment</span><select value={design.alignment} onChange={(event) => update({ alignment: event.target.value as Alignment })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <label className="carousel-manual-design-field carousel-manual-color"><span>Main font color</span><div><input type="color" value={resolvedColor} onChange={(event) => update({ textColor: event.target.value })}/><code>{resolvedColor.toUpperCase()}</code><button type="button" onClick={() => update({ textColor: null })}>Auto</button></div></label>
      </div>
    </details>

    <details>
      <summary>Background texture</summary>
      <div className="carousel-manual-texture-panel">
        <label className="carousel-manual-design-field"><span>Texture</span><select value={design.texture} onChange={(event) => {
          const next = CAROUSEL_TEXTURES.find((item) => item.id === event.target.value);
          update({ texture: event.target.value as CarouselTextureId, ...(next ? { textureStrength: next.defaultStrength } : {}) });
        }}>{CAROUSEL_TEXTURES.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.mood}</option>)}</select></label>
        <p>{texture?.description || "Choose a surface treatment."}</p>
        <RangeControl label="Texture amount" min={0} max={70} step={1} value={design.textureStrength} onChange={(value) => update({ textureStrength: value })}/>
        <button type="button" className="carousel-manual-apply-all" onClick={applyTextureToAll}>Use this texture on all slides</button>
      </div>
    </details>
  </section>, target);
}

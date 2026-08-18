"use client";

import { createPortal } from "react-dom";
import { Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAROUSEL_TEXTURES,
  STYLE_TEXTURE_DEFAULTS,
  type CarouselTextureId,
  type CarouselVisualStyle
} from "@/carousel-design-rules";

type Alignment = "left" | "center" | "right";
type SaveStatus = "loading" | "saved" | "saving" | "error";

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
type DesignPayload = {
  frames: Array<{ id: string; order: number }>;
  designs: Array<{ frameId: string; design: unknown; updatedAt: string }>;
};

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

function normalizeDesign(raw: unknown, style: CarouselVisualStyle): SlideDesign {
  const fallback = defaultDesign(style);
  const parsed = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Partial<SlideDesign> : {};
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
}

function storageKey(projectId: string, slideIndex: number) {
  return `ag-carousel-manual-design-v1:${projectId}:${slideIndex + 1}`;
}

function readLocalDesign(projectId: string, slideIndex: number, style: CarouselVisualStyle): SlideDesign {
  try {
    const stored = window.localStorage.getItem(storageKey(projectId, slideIndex));
    if (stored) return normalizeDesign(JSON.parse(stored), style);
  } catch {}
  return defaultDesign(style);
}

function writeLocalDesign(projectId: string, slideIndex: number, design: SlideDesign) {
  try { window.localStorage.setItem(storageKey(projectId, slideIndex), JSON.stringify(design)); } catch {}
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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
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
  const [frameIds, setFrameIds] = useState<string[]>([]);
  const [serverDesigns, setServerDesigns] = useState<Record<string, SlideDesign>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [saveError, setSaveError] = useState("");
  const saveTimer = useRef<number | null>(null);

  const projectId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("project") || "";
  }, []);

  const resolveDesign = useCallback((slideIndex: number, nextStyle: CarouselVisualStyle) => {
    const frameId = frameIds[slideIndex];
    if (frameId && serverDesigns[frameId]) return serverDesigns[frameId];
    return readLocalDesign(projectId, slideIndex, nextStyle);
  }, [frameIds, projectId, serverDesigns]);

  const applyEveryBoard = useCallback((activeDesign?: SlideDesign) => {
    if (!root || !projectId) return;
    const activePosition = currentSlide(root);
    const activeStyle = visualStyle(root);
    const visibleDesign = activeDesign ?? resolveDesign(activePosition.index, activeStyle);
    applyDesign(root.querySelector<HTMLElement>(".creative-preview-panel .persistent-carousel-artboard"), visibleDesign);

    const renderHosts = [...root.querySelectorAll<HTMLElement>(".creative-render-stage > .creative-frame-preview")];
    renderHosts.forEach((host, index) => applyDesign(host.querySelector<HTMLElement>(".persistent-carousel-artboard"), resolveDesign(index, activeStyle)));
  }, [projectId, resolveDesign, root]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setSaveStatus("loading");
    void requestJson<DesignPayload>(`/api/admin/creative-projects/${projectId}/frame-design`).then((payload) => {
      if (cancelled) return;
      const ordered = [...payload.frames].sort((a, b) => a.order - b.order);
      const ids = ordered.map((frame) => frame.id);
      const next: Record<string, SlideDesign> = {};
      const currentStyle = visualStyle(document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell"));
      payload.designs.forEach((item) => { next[item.frameId] = normalizeDesign(item.design, currentStyle); });
      setFrameIds(ids);
      setServerDesigns(next);
      ids.forEach((frameId, index) => { if (next[frameId]) writeLocalDesign(projectId, index, next[frameId]); });
      setSaveStatus("saved");
      setSaveError("");
    }).catch((error) => {
      if (cancelled) return;
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "Slide styling could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [projectId]);

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
        const nextDesign = resolveDesign(nextPosition.index, nextStyle);
        setRoot(nextRoot);
        setTarget(nextTarget);
        setPosition(nextPosition);
        setStyle(nextStyle);
        setDesign(nextDesign);
        window.setTimeout(() => {
          applyDesign(nextRoot.querySelector<HTMLElement>(".creative-preview-panel .persistent-carousel-artboard"), nextDesign);
          const renderHosts = [...nextRoot.querySelectorAll<HTMLElement>(".creative-render-stage > .creative-frame-preview")];
          renderHosts.forEach((host, index) => applyDesign(host.querySelector<HTMLElement>(".persistent-carousel-artboard"), resolveDesign(index, nextStyle)));
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
  }, [projectId, resolveDesign]);

  useEffect(() => {
    return () => { if (saveTimer.current !== null) window.clearTimeout(saveTimer.current); };
  }, []);

  function scheduleSave(frameId: string, next: SlideDesign) {
    if (!frameId || !projectId) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    setSaveError("");
    saveTimer.current = window.setTimeout(() => {
      void requestJson(`/api/admin/creative-projects/${projectId}/frame-design`, {
        method: "POST",
        body: JSON.stringify({ frameId, design: next })
      }).then(() => {
        setSaveStatus("saved");
        setSaveError("");
      }).catch((error) => {
        setSaveStatus("error");
        setSaveError(error instanceof Error ? error.message : "Slide styling could not be saved.");
      });
    }, 420);
  }

  function update(patch: Partial<SlideDesign>) {
    const frameId = frameIds[position.index];
    setDesign((current) => {
      const next = { ...current, ...patch };
      writeLocalDesign(projectId, position.index, next);
      if (frameId) {
        setServerDesigns((designs) => ({ ...designs, [frameId]: next }));
        scheduleSave(frameId, next);
      }
      window.setTimeout(() => applyEveryBoard(next), 0);
      return next;
    });
  }

  function resetSlide() {
    const frameId = frameIds[position.index];
    if (!projectId) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    try { window.localStorage.removeItem(storageKey(projectId, position.index)); } catch {}
    const next = defaultDesign(style);
    setDesign(next);
    if (frameId) {
      setServerDesigns((current) => {
        const clone = { ...current };
        delete clone[frameId];
        return clone;
      });
      setSaveStatus("saving");
      void requestJson(`/api/admin/creative-projects/${projectId}/frame-design`, { method: "DELETE", body: JSON.stringify({ frameId }) }).then(() => setSaveStatus("saved")).catch((error) => {
        setSaveStatus("error");
        setSaveError(error instanceof Error ? error.message : "Slide styling could not be reset.");
      });
    }
    applyEveryBoard(next);
  }

  async function applyTextureToAll() {
    if (!projectId || !frameIds.length) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    const nextDesigns: Record<string, SlideDesign> = { ...serverDesigns };
    const payloads = frameIds.map((frameId, index) => {
      const current = resolveDesign(index, style);
      const next = { ...current, texture: design.texture, textureStrength: design.textureStrength };
      nextDesigns[frameId] = next;
      writeLocalDesign(projectId, index, next);
      return { frameId, design: next };
    });
    setServerDesigns(nextDesigns);
    setSaveStatus("saving");
    setSaveError("");
    try {
      await Promise.all(payloads.map((payload) => requestJson(`/api/admin/creative-projects/${projectId}/frame-design`, { method: "POST", body: JSON.stringify(payload) })));
      setSaveStatus("saved");
      applyEveryBoard(design);
    } catch (error) {
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "Texture could not be applied to every slide.");
    }
  }

  if (!target || !projectId) return null;

  const resolvedColor = design.textColor || defaultTextColor(style);
  const texture = CAROUSEL_TEXTURES.find((item) => item.id === design.texture);
  const saveLabel = saveStatus === "loading" ? "loading styling" : saveStatus === "saving" ? "saving…" : saveStatus === "error" ? "save failed" : "saved with project";

  return createPortal(<section className="carousel-manual-design-controls" aria-label="Manual slide design controls">
    <div className="carousel-manual-design-heading">
      <div><SlidersHorizontal size={16}/><span><strong>Slide styling</strong><small>Slide {position.index + 1} of {position.total} · {saveLabel}</small></span></div>
      <button type="button" disabled={saveStatus === "loading"} onClick={resetSlide}>{saveStatus === "loading" ? <Loader2 className="spin" size={14}/> : <RotateCcw size={14}/>} Reset</button>
    </div>
    {saveStatus === "error" && saveError ? <p className="carousel-manual-design-error">{saveError}</p> : null}

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
        <button type="button" className="carousel-manual-apply-all" disabled={saveStatus === "loading" || saveStatus === "saving"} onClick={() => void applyTextureToAll()}>Use this texture on all slides</button>
      </div>
    </details>
  </section>, target);
}

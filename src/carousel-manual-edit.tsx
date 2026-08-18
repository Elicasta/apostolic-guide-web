"use client";

import { createPortal } from "react-dom";
import { Check, Loader2, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAROUSEL_TEXTURES,
  STYLE_TEXTURE_DEFAULTS,
  type CarouselTextureId,
  type CarouselVisualStyle
} from "@/carousel-design-rules";

type Alignment = "left" | "center" | "right";
type SaveState = "idle" | "loading" | "saving" | "saved" | "error";

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
    alignment: style === "editorial" || style === "verse" ? "left" : "center",
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

function activeSlideIndex(root: HTMLElement | null) {
  if (!root) return 0;
  const rows = [...root.querySelectorAll<HTMLElement>(".creative-frame-row")];
  const active = rows.findIndex((row) => row.classList.contains("is-active"));
  return Math.max(0, active);
}

function activeSlideLabel(root: HTMLElement | null) {
  if (!root) return "Slide 1";
  const rows = [...root.querySelectorAll<HTMLElement>(".creative-frame-row")];
  const index = activeSlideIndex(root);
  const preview = root.querySelector<HTMLElement>(".creative-preview-panel .creative-frame-preview");
  const noun = preview?.classList.contains("is-story") ? "Frame" : preview?.classList.contains("is-single") ? "Post" : "Slide";
  return `${noun} ${index + 1}${rows.length > 1 ? ` of ${rows.length}` : ""}`;
}

function applyDesign(board: HTMLElement | null, design: SlideDesign) {
  if (!board) return;
  const artwork = board.querySelector<HTMLElement>(".carousel-artwork");
  if (artwork) {
    artwork.style.setProperty("--copy-y", `${design.copyY}%`);
    artwork.style.setProperty("--headline-scale", String(design.headlineScale));
    artwork.style.setProperty("--title-width", `${design.titleWidth}%`);
    artwork.style.setProperty("--body-scale", String(design.bodyScale));
    artwork.style.setProperty("--body-width", `${design.bodyWidth}%`);
    artwork.style.setProperty("--copy-gap", `${design.copyGap}cqw`);
    artwork.style.setProperty("--copy-align", design.alignment);
  }
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
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers || {}) }
  });
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
  return <label className="carousel-inline-range">
    <span>{label}<b>{Math.round(value)}{suffix}</b></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))}/>
  </label>;
}

export function CarouselManualEdit() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [slideLabel, setSlideLabel] = useState("Slide 1");
  const [frameIds, setFrameIds] = useState<string[]>([]);
  const [designs, setDesigns] = useState<Record<string, SlideDesign>>({});
  const [design, setDesign] = useState<SlideDesign>(() => defaultDesign("street"));
  const [style, setStyle] = useState<CarouselVisualStyle>("street");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const saveTimer = useRef<number | null>(null);

  const projectId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("project") || "";
  }, []);

  const currentFrameId = frameIds[activeSlideIndex(root)] || "";

  const applyEveryBoard = useCallback((next: SlideDesign, frameIndex = activeSlideIndex(root)) => {
    if (!root) return;
    applyDesign(root.querySelector<HTMLElement>(".creative-preview-panel .persistent-carousel-artboard"), next);
    const renderHosts = [...root.querySelectorAll<HTMLElement>(".creative-render-stage > .creative-frame-preview")];
    const renderBoard = renderHosts[frameIndex]?.querySelector<HTMLElement>(".persistent-carousel-artboard");
    applyDesign(renderBoard, next);
  }, [root]);

  const syncSelectedDesign = useCallback((nextRoot: HTMLElement, nextDesigns: Record<string, SlideDesign>, nextFrameIds: string[]) => {
    const nextStyle = visualStyle(nextRoot);
    const index = activeSlideIndex(nextRoot);
    const frameId = nextFrameIds[index];
    const next = frameId && nextDesigns[frameId] ? nextDesigns[frameId] : defaultDesign(nextStyle);
    setStyle(nextStyle);
    setDesign(next);
    setSlideLabel(activeSlideLabel(nextRoot));
    window.setTimeout(() => applyDesign(nextRoot.querySelector<HTMLElement>(".creative-preview-panel .persistent-carousel-artboard"), next), 0);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setSaveState("loading");
    void requestJson<DesignPayload>(`/api/admin/creative-projects/${projectId}/frame-design`).then((payload) => {
      if (cancelled) return;
      const ids = [...payload.frames].sort((a, b) => a.order - b.order).map((frame) => frame.id);
      const nextRoot = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
      const nextStyle = visualStyle(nextRoot);
      const nextDesigns: Record<string, SlideDesign> = {};
      payload.designs.forEach((item) => { nextDesigns[item.frameId] = normalizeDesign(item.design, nextStyle); });
      setFrameIds(ids);
      setDesigns(nextDesigns);
      if (nextRoot) syncSelectedDesign(nextRoot, nextDesigns, ids);
      setSaveState("saved");
      setSaveError("");
    }).catch((error) => {
      if (cancelled) return;
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Slide styling could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [projectId, syncSelectedDesign]);

  useEffect(() => {
    const master = document.querySelector<HTMLElement>(".carousel-studio-master");
    if (!master) return;
    let currentRoot: HTMLElement | null = null;
    let observer: MutationObserver | null = null;

    const bind = () => {
      const nextRoot = master.querySelector<HTMLElement>(".creative-studio-shell");
      if (!nextRoot) return;
      const previewPanel = nextRoot.querySelector<HTMLElement>(".creative-preview-panel");
      if (!previewPanel) return;

      let host = previewPanel.querySelector<HTMLElement>("[data-carousel-inline-manual-host]");
      if (!host) {
        host = document.createElement("div");
        host.dataset.carouselInlineManualHost = "true";
        host.className = "carousel-inline-manual-host";
        const visualControls = previewPanel.querySelector<HTMLElement>(".creative-visual-controls");
        if (visualControls) visualControls.before(host);
        else previewPanel.append(host);
      }

      setRoot(nextRoot);
      setTarget(host);
      setOpen(nextRoot.dataset.manualEdit === "open");
      setSlideLabel(activeSlideLabel(nextRoot));

      if (currentRoot === nextRoot) return;
      observer?.disconnect();
      currentRoot = nextRoot;
      observer = new MutationObserver(() => {
        setSlideLabel(activeSlideLabel(nextRoot));
        const nextStyle = visualStyle(nextRoot);
        const index = activeSlideIndex(nextRoot);
        const frameId = frameIds[index];
        const next = frameId && designs[frameId] ? designs[frameId] : defaultDesign(nextStyle);
        setStyle(nextStyle);
        setDesign(next);
        window.setTimeout(() => applyDesign(nextRoot.querySelector<HTMLElement>(".creative-preview-panel .persistent-carousel-artboard"), next), 0);
      });
      observer.observe(nextRoot, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-creative-template"] });
    };

    bind();
    const projectObserver = new MutationObserver(bind);
    projectObserver.observe(master, { childList: true, subtree: true });
    return () => {
      if (currentRoot) delete currentRoot.dataset.manualEdit;
      observer?.disconnect();
      projectObserver.disconnect();
    };
  }, [designs, frameIds]);

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  }, []);

  function scheduleSave(frameId: string, next: SlideDesign) {
    if (!projectId || !frameId) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    setSaveState("saving");
    setSaveError("");
    saveTimer.current = window.setTimeout(() => {
      void requestJson(`/api/admin/creative-projects/${projectId}/frame-design`, {
        method: "POST",
        body: JSON.stringify({ frameId, design: next })
      }).then(() => setSaveState("saved")).catch((error) => {
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : "Slide styling could not be saved.");
      });
    }, 350);
  }

  function update(patch: Partial<SlideDesign>) {
    const index = activeSlideIndex(root);
    const frameId = frameIds[index];
    setDesign((current) => {
      const next = { ...current, ...patch };
      if (frameId) {
        setDesigns((currentDesigns) => ({ ...currentDesigns, [frameId]: next }));
        scheduleSave(frameId, next);
      }
      window.setTimeout(() => applyEveryBoard(next, index), 0);
      return next;
    });
  }

  function resetCurrent() {
    const index = activeSlideIndex(root);
    const frameId = frameIds[index];
    const next = defaultDesign(style);
    setDesign(next);
    if (!frameId || !projectId) {
      applyEveryBoard(next, index);
      return;
    }
    setDesigns((current) => {
      const clone = { ...current };
      delete clone[frameId];
      return clone;
    });
    setSaveState("saving");
    void requestJson(`/api/admin/creative-projects/${projectId}/frame-design`, {
      method: "DELETE",
      body: JSON.stringify({ frameId })
    }).then(() => setSaveState("saved")).catch((error) => {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Slide styling could not be reset.");
    });
    applyEveryBoard(next, index);
  }

  async function applyTextureToAll() {
    if (!projectId || !frameIds.length) return;
    setSaveState("saving");
    setSaveError("");
    try {
      const nextDesigns = { ...designs };
      await Promise.all(frameIds.map(async (frameId, index) => {
        const base = designs[frameId] || defaultDesign(style);
        const next = { ...base, texture: design.texture, textureStrength: design.textureStrength };
        nextDesigns[frameId] = next;
        const renderHosts = root ? [...root.querySelectorAll<HTMLElement>(".creative-render-stage > .creative-frame-preview")] : [];
        applyDesign(renderHosts[index]?.querySelector<HTMLElement>(".persistent-carousel-artboard") ?? null, next);
        await requestJson(`/api/admin/creative-projects/${projectId}/frame-design`, {
          method: "POST",
          body: JSON.stringify({ frameId, design: next })
        });
      }));
      setDesigns(nextDesigns);
      applyDesign(root?.querySelector<HTMLElement>(".creative-preview-panel .persistent-carousel-artboard") ?? null, design);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Texture could not be applied to every slide.");
    }
  }

  function toggleManualEdit() {
    if (!root) return;
    const next = !open;
    setOpen(next);
    if (next) root.dataset.manualEdit = "open";
    else delete root.dataset.manualEdit;
  }

  if (!target || !projectId) return null;

  const resolvedColor = design.textColor || defaultTextColor(style);
  const texture = CAROUSEL_TEXTURES.find((item) => item.id === design.texture);

  return createPortal(<div className={`carousel-inline-manual ${open ? "is-open" : ""}`}>
    <button type="button" className={`carousel-manual-edit-toggle ${open ? "is-open" : ""}`} onClick={toggleManualEdit} aria-pressed={open}>
      {open ? <Check size={16}/> : <SlidersHorizontal size={16}/>}
      <span><strong>{open ? "Done Editing" : "Manual Edit"}</strong><small>{open ? `${slideLabel} · controls directly under preview` : "Type, color, size, layout + textures"}</small></span>
    </button>

    {open ? <section className="carousel-inline-manual-panel">
      <div className="carousel-inline-manual-head">
        <div><strong>{slideLabel}</strong><small>{saveState === "loading" ? "Loading styling…" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved with project"}</small></div>
        <div className="carousel-inline-manual-actions">
          <button type="button" onClick={resetCurrent} disabled={saveState === "loading" || saveState === "saving"}>{saveState === "loading" ? <Loader2 size={14} className="spin"/> : <RotateCcw size={14}/>} Reset</button>
          <button type="button" className="is-close" onClick={toggleManualEdit}><X size={14}/> Done</button>
        </div>
      </div>

      {saveState === "error" && saveError ? <p className="carousel-inline-error">{saveError}</p> : null}

      <details open>
        <summary>Type + layout</summary>
        <div className="carousel-inline-grid">
          <RangeControl label="Position" min={32} max={68} step={1} value={design.copyY} onChange={(value) => update({ copyY: value })}/>
          <RangeControl label="Headline size" min={55} max={145} step={1} value={design.headlineScale * 100} onChange={(value) => update({ headlineScale: value / 100 })}/>
          <RangeControl label="Headline width" min={48} max={98} step={1} value={design.titleWidth} onChange={(value) => update({ titleWidth: value })}/>
          <RangeControl label="Body size" min={65} max={135} step={1} value={design.bodyScale * 100} onChange={(value) => update({ bodyScale: value / 100 })}/>
          <RangeControl label="Body width" min={45} max={94} step={1} value={design.bodyWidth} onChange={(value) => update({ bodyWidth: value })}/>
          <RangeControl label="Copy gap" min={.5} max={5} step={.1} value={design.copyGap} suffix="" onChange={(value) => update({ copyGap: value })}/>
          <label className="carousel-inline-field"><span>Alignment</span><select value={design.alignment} onChange={(event) => update({ alignment: event.target.value as Alignment })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          <label className="carousel-inline-field carousel-inline-color"><span>Main font color</span><div><input type="color" value={resolvedColor} onChange={(event) => update({ textColor: event.target.value })}/><code>{resolvedColor.toUpperCase()}</code><button type="button" onClick={() => update({ textColor: null })}>Auto</button></div></label>
        </div>
      </details>

      <details open>
        <summary>Background texture</summary>
        <div className="carousel-inline-texture">
          <label className="carousel-inline-field"><span>Texture</span><select value={design.texture} onChange={(event) => {
            const nextTexture = CAROUSEL_TEXTURES.find((item) => item.id === event.target.value);
            update({ texture: event.target.value as CarouselTextureId, ...(nextTexture ? { textureStrength: nextTexture.defaultStrength } : {}) });
          }}>{CAROUSEL_TEXTURES.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.mood}</option>)}</select></label>
          <p>{texture?.description || "Choose a surface treatment."}</p>
          <RangeControl label="Texture amount" min={0} max={70} step={1} value={design.textureStrength} onChange={(value) => update({ textureStrength: value })}/>
          <button type="button" className="carousel-inline-apply-all" disabled={saveState === "loading" || saveState === "saving"} onClick={() => void applyTextureToAll()}>Use this texture on all slides</button>
        </div>
      </details>
    </section> : null}
  </div>, target);
}

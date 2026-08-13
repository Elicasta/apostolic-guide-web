"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles, WandSparkles } from "lucide-react";
import {
  CAROUSEL_TEXTURES,
  MODE_STYLE_DEFAULTS,
  STYLE_TEXTURE_DEFAULTS,
  type CarouselMode,
  type CarouselTextureId,
  type CarouselVisualStyle
} from "@/carousel-design-rules";

type TextureChoice = { texture: CarouselTextureId; strength: number };
type TextureResponse = { direction?: { texture: CarouselTextureId; strength: number; rationale: string }; error?: string };

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
  const heading = document.querySelector<HTMLElement>(".carousel-preview-card .carousel-card-heading h2")?.innerText?.trim()
    || document.querySelector<HTMLElement>(".carousel-studio-heading h1")?.innerText?.trim()
    || "carousel";
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "carousel";
}

function readSlideCopy() {
  const board = document.querySelector<HTMLElement>(".carousel-artboard");
  if (!board) return { title: "", body: "" };
  const title = board.querySelector<HTMLElement>(".carousel-copy > strong, .carousel-verse-connection > strong")?.innerText?.trim() ?? "";
  const body = board.querySelector<HTMLElement>(".carousel-copy > p, .carousel-verse-connection > p")?.innerText?.trim() ?? "";
  return { title, body };
}

function applyTexture(board: HTMLElement | undefined | null, choice: TextureChoice) {
  if (!board) return;
  board.dataset.texture = choice.texture;
  board.style.setProperty("--texture-strength", String(choice.strength / 100));
}

function storageKey(deck: string, style: CarouselVisualStyle, slide: number) {
  return `ag-carousel-texture-v2:${deck}:${style}:${slide}`;
}

function loadChoice(deck: string, style: CarouselVisualStyle, slide: number): TextureChoice {
  try {
    const saved = localStorage.getItem(storageKey(deck, style, slide));
    if (saved) {
      const parsed = JSON.parse(saved) as TextureChoice;
      if (CAROUSEL_TEXTURES.some((texture) => texture.id === parsed.texture) && Number.isFinite(parsed.strength)) return parsed;
    }
  } catch {}
  return STYLE_TEXTURE_DEFAULTS[style];
}

function saveChoice(deck: string, style: CarouselVisualStyle, slide: number, choice: TextureChoice) {
  try { localStorage.setItem(storageKey(deck, style, slide), JSON.stringify(choice)); } catch {}
}

function syncExportBoards(deck: string, style: CarouselVisualStyle) {
  const boards = Array.from(document.querySelectorAll<HTMLElement>(".carousel-export-artboard"));
  boards.forEach((board, index) => applyTexture(board, loadChoice(deck, style, index + 1)));
}

export function CarouselTextureDirector({ aiReady }: { aiReady: boolean }) {
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [style, setStyle] = useState<CarouselVisualStyle>("street");
  const [slide, setSlide] = useState(1);
  const [total, setTotal] = useState(1);
  const [deck, setDeck] = useState("carousel");
  const [choice, setChoice] = useState<TextureChoice>(STYLE_TEXTURE_DEFAULTS.street);
  const [instruction, setInstruction] = useState("Use the approved Apostolic Guide texture that best supports this slide without reducing readability.");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Texture is saved per slide. Change this slide without changing the others.");

  const compatibleTextures = useMemo(() => CAROUSEL_TEXTURES.filter((texture) => texture.id === "none" || texture.bestFor.includes(style)), [style]);

  useEffect(() => {
    let disposed = false;
    const sync = () => {
      if (disposed) return;
      const target = document.querySelector(".carousel-preview-card");
      if (target) setPortalTarget(target);
      const nextStyle = readStyle();
      const position = readSlidePosition();
      const nextDeck = readDeckKey();
      setStyle(nextStyle);
      setSlide(position.slide);
      setTotal(position.total);
      setDeck(nextDeck);
      const nextChoice = loadChoice(nextDeck, nextStyle, position.slide);
      setChoice(nextChoice);
      applyTexture(document.querySelector<HTMLElement>(".carousel-artboard"), nextChoice);
      syncExportBoards(nextDeck, nextStyle);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true, attributeFilter: ["class"] });

    const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".carousel-sourcebar select"));
    const modeSelect = selects[1];
    const handleModeChange = () => {
      const mode = modeSelect?.value as CarouselMode;
      const preferred = MODE_STYLE_DEFAULTS[mode];
      if (!preferred) return;
      const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".carousel-style-tabs button"));
      tabs[STYLE_INDEX[preferred]]?.click();
      window.setTimeout(sync, 0);
    };
    modeSelect?.addEventListener("change", handleModeChange);

    return () => {
      disposed = true;
      observer.disconnect();
      modeSelect?.removeEventListener("change", handleModeChange);
    };
  }, []);

  useEffect(() => {
    saveChoice(deck, style, slide, choice);
    applyTexture(document.querySelector<HTMLElement>(".carousel-artboard"), choice);
    const exports = Array.from(document.querySelectorAll<HTMLElement>(".carousel-export-artboard"));
    applyTexture(exports[slide - 1], choice);
  }, [choice, deck, slide, style]);

  async function directTexture() {
    if (!aiReady || busy) return;
    setBusy(true);
    setMessage("AI is choosing from the approved Apostolic Guide texture library…");
    try {
      const copy = readSlideCopy();
      const response = await fetch("/api/admin/carousel-studio/texture-direct", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ style, title: copy.title, body: copy.body, instruction })
      });
      const data = await response.json().catch(() => ({})) as TextureResponse;
      if (!response.ok || !data.direction) throw new Error(data.error || "Texture direction failed.");
      setChoice({ texture: data.direction.texture, strength: data.direction.strength });
      setMessage(data.direction.rationale);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Texture direction failed.");
    } finally {
      setBusy(false);
    }
  }

  function applyToAll() {
    for (let index = 1; index <= total; index += 1) saveChoice(deck, style, index, choice);
    syncExportBoards(deck, style);
    setMessage(`Applied ${CAROUSEL_TEXTURES.find((texture) => texture.id === choice.texture)?.label ?? "texture"} to all ${total} slides.`);
  }

  if (!portalTarget) return null;

  return createPortal(
    <section className="carousel-texture-director" aria-label="Texture library">
      <div className="carousel-texture-heading">
        <div>
          <span>Surface treatment</span>
          <strong>Texture Library</strong>
        </div>
        <small>Slide {String(slide).padStart(2, "0")} / {String(total).padStart(2, "0")}</small>
      </div>

      <p className="carousel-texture-slide-note">Texture edits are per slide. The three AG textures are the supplied brand surfaces.</p>

      <div className="carousel-texture-grid">
        {compatibleTextures.map((texture) => (
          <button
            type="button"
            key={texture.id}
            className={choice.texture === texture.id ? "is-active" : ""}
            data-texture-swatch={texture.id}
            onClick={() => setChoice({ texture: texture.id, strength: texture.defaultStrength })}
          >
            <i aria-hidden="true"/>
            <span><strong>{texture.label}</strong><small>{texture.mood}</small></span>
          </button>
        ))}
      </div>

      <label className="carousel-texture-strength">
        <span>Texture strength</span>
        <input type="range" min="0" max="70" step="1" value={choice.strength} onChange={(event) => setChoice((current) => ({ ...current, strength: Number(event.target.value) }))}/>
        <b>{choice.strength}%</b>
      </label>

      <div className="carousel-texture-ai">
        <label>
          <span><WandSparkles size={14}/> AI texture direction</span>
          <textarea rows={2} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Example: use the supplied navy paper, subtle enough for teaching copy"/>
        </label>
        <button type="button" className="button" disabled={!aiReady || busy || !instruction.trim()} onClick={() => void directTexture()}>
          {busy ? <Loader2 className="spin" size={15}/> : <Sparkles size={15}/>} Choose texture
        </button>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",marginTop:8}}>
        <p className="carousel-texture-message">{message}</p>
        <button type="button" className="button button-outline" onClick={applyToAll}>Use on all</button>
      </div>
    </section>,
    portalTarget
  );
}

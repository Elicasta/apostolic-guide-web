"use client";

import { createPortal } from "react-dom";
import { Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type VisualStyle = "street" | "editorial" | "cinematic" | "verse" | "manifesto";
type ProjectArtworkInfo = {
  id: string;
  title: string;
  pathwaySlug: string;
  format: "single" | "carousel" | "story";
  frames: Array<{ id: string; order: number }>;
};

type SavedBackground = {
  frameId: string;
  order: number;
  assetId: string;
  previewUrl: string | null;
  metadata?: Record<string, unknown>;
};

type BackgroundRecommendation = {
  mode: "texture" | "image" | "none";
  reason: string;
  prompt: string;
  overlay: number;
};

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

function activeSlideIndex(root: HTMLElement | null) {
  if (!root) return 0;
  const rows = [...root.querySelectorAll<HTMLElement>(".creative-frame-row")];
  const active = rows.findIndex((row) => row.classList.contains("is-active"));
  return Math.max(0, active);
}

function setBoardBackground(board: HTMLElement | null, previewUrl: string | null) {
  if (!board) return;
  const artwork = board.querySelector<HTMLElement>(".carousel-artwork");
  if (!artwork) return;
  let layer = artwork.querySelector<HTMLElement>(":scope > .carousel-generated-background");
  if (!previewUrl) {
    layer?.remove();
    board.classList.remove("has-generated-background");
    return;
  }
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "carousel-generated-background";
    artwork.prepend(layer);
  }
  layer.style.backgroundImage = `url(${JSON.stringify(previewUrl)})`;
  board.classList.add("has-generated-background");
}

function applyBackgrounds(root: HTMLElement | null, project: ProjectArtworkInfo | null, backgrounds: SavedBackground[]) {
  if (!root || !project) return;
  const byFrame = new Map(backgrounds.map((item) => [item.frameId, item.previewUrl]));
  const renderHosts = [...root.querySelectorAll<HTMLElement>(".creative-render-stage > .creative-frame-preview")];
  project.frames.forEach((frame, index) => {
    setBoardBackground(renderHosts[index]?.querySelector<HTMLElement>(".persistent-carousel-artboard") ?? null, byFrame.get(frame.id) || null);
  });
  const index = activeSlideIndex(root);
  const frame = project.frames[index];
  setBoardBackground(root.querySelector<HTMLElement>(".creative-preview-panel .persistent-carousel-artboard"), frame ? byFrame.get(frame.id) || null : null);
}

function currentCopy(root: HTMLElement | null, index: number, total: number) {
  const board = root?.querySelector<HTMLElement>(".creative-preview-panel .persistent-carousel-artboard");
  const copy = board?.querySelector<HTMLElement>(".carousel-copy");
  const title = copy?.querySelector<HTMLElement>(":scope > strong")?.textContent?.trim() || "";
  const body = copy?.querySelector<HTMLElement>(":scope > p")?.textContent?.trim() || "";
  const reference = copy?.querySelector<HTMLElement>(":scope > span")?.textContent?.trim() || "";
  const kind = index === 0 ? "cover" : index === total - 1 ? "cta" : reference ? "scripture" : "statement";
  return { title, body, reference, kind } as const;
}

export function CarouselSingleArtDirector({ projectId: suppliedProjectId = null }: { projectId?: string | null } = {}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [project, setProject] = useState<ProjectArtworkInfo | null>(null);
  const [backgrounds, setBackgrounds] = useState<SavedBackground[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<"template" | "directed">("template");
  const [direction, setDirection] = useState("");
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("street");
  const [recommendation, setRecommendation] = useState<BackgroundRecommendation | null>(null);
  const [working, setWorking] = useState<"generate" | "recommend" | "clear" | "">("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const projectId = useMemo(() => suppliedProjectId || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("project") || "" : ""), [suppliedProjectId]);
  const currentFrame = project?.frames[activeIndex] || null;
  const currentBackground = currentFrame ? backgrounds.find((item) => item.frameId === currentFrame.id) || null : null;

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const data = await requestJson<{ project: ProjectArtworkInfo; backgrounds: SavedBackground[] }>(`/api/admin/creative-projects/${projectId}/artwork`);
      setProject(data.project);
      setBackgrounds(data.backgrounds.filter((item) => Boolean(item.previewUrl)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sol art tools could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    const sync = () => {
      if (disposed) return;
      const nextRoot = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
      const nextTarget = nextRoot?.querySelector<HTMLElement>(".creative-preview-panel") || null;
      setRoot(nextRoot);
      setTarget(nextTarget);
      const nextIndex = activeSlideIndex(nextRoot);
      setActiveIndex((current) => current === nextIndex ? current : nextIndex);
      window.setTimeout(() => applyBackgrounds(nextRoot, project, backgrounds), 0);
      if (nextRoot && !observer) {
        observer = new MutationObserver(() => {
          const index = activeSlideIndex(nextRoot);
          setActiveIndex((current) => current === index ? current : index);
          window.setTimeout(() => applyBackgrounds(nextRoot, project, backgrounds), 0);
        });
        observer.observe(nextRoot, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
      }
    };
    sync();
    const masterObserver = new MutationObserver(sync);
    masterObserver.observe(document.body, { subtree: true, childList: true });
    return () => {
      disposed = true;
      observer?.disconnect();
      masterObserver.disconnect();
    };
  }, [backgrounds, project]);

  useEffect(() => {
    if (!currentFrame) return;
    const savedDirection = currentBackground?.metadata?.artDirection;
    const savedStyle = currentBackground?.metadata?.visualStyle;
    setMode(currentBackground ? "directed" : "template");
    setDirection(typeof savedDirection === "string" ? savedDirection : "");
    if (savedStyle === "street" || savedStyle === "editorial" || savedStyle === "cinematic" || savedStyle === "verse" || savedStyle === "manifesto") setVisualStyle(savedStyle);
    setRecommendation(null);
    setMessage("");
    setError("");
    window.setTimeout(() => applyBackgrounds(root, project, backgrounds), 0);
  }, [activeIndex, backgrounds, currentBackground, currentFrame, project, root]);

  async function useTemplate() {
    if (!projectId || !currentFrame) return;
    setWorking("clear");
    setError("");
    try {
      await requestJson(`/api/admin/creative-projects/${projectId}/artwork`, {
        method: "DELETE",
        body: JSON.stringify({ frameId: currentFrame.id })
      });
      const next = backgrounds.filter((item) => item.frameId !== currentFrame.id);
      setBackgrounds(next);
      setMode("template");
      setDirection("");
      applyBackgrounds(root, project, next);
      setMessage("Generated art removed from this frame. The template surface is active again.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Template mode could not be restored.");
    } finally {
      setWorking("");
    }
  }

  async function recommend() {
    if (!root || !project || !currentFrame) return;
    setWorking("recommend");
    setError("");
    setMessage("Sol is deciding whether this frame benefits from an image, texture, or a clean surface…");
    try {
      const copy = currentCopy(root, activeIndex, project.frames.length);
      const data = await requestJson<{ direction: BackgroundRecommendation }>("/api/admin/carousel-studio/background-direct", {
        method: "POST",
        body: JSON.stringify({
          style: visualStyle,
          kind: copy.kind,
          title: copy.title,
          body: copy.body,
          reference: copy.reference,
          secondaryReference: "",
          slideNumber: activeIndex + 1,
          totalSlides: project.frames.length
        })
      });
      setRecommendation(data.direction);
      setMessage(data.direction.reason);
      if (data.direction.mode === "image") {
        setMode("directed");
        if (data.direction.prompt.trim()) setDirection(data.direction.prompt.trim());
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Background direction failed.");
    } finally {
      setWorking("");
    }
  }

  async function generate() {
    if (!projectId || !project || !currentFrame || direction.trim().length < 3) return;
    setWorking("generate");
    setError("");
    setMessage("Sol is generating the visual layer. Text, Scripture, logo, and layout stay editable.");
    try {
      const generated = await requestJson<{ dataUrl: string; prompt: string; solModel: string; imageModel: string; referenceCount: number }>("/api/admin/pathway-assets/generate-image", {
        method: "POST",
        body: JSON.stringify({
          pathwaySlug: project.pathwaySlug,
          creationType: project.format === "story" ? "story" : "background",
          visualStyle,
          prompt: direction.trim(),
          orientation: "portrait",
          quality: "medium"
        })
      });
      const uploaded = await requestJson<{ asset: { id: string } }>("/api/admin/pathway-assets/upload", {
        method: "POST",
        body: JSON.stringify({
          pathwaySlug: project.pathwaySlug,
          studio: "carousel",
          assetType: "generated-image",
          title: `${project.title} · ${project.format === "story" ? "Frame" : "Slide"} ${currentFrame.order} art`,
          dataUrl: generated.dataUrl,
          sourceType: "generated",
          prompt: generated.prompt,
          model: generated.imageModel,
          metadata: {
            creativeProjectId: projectId,
            frameId: currentFrame.id,
            artDirection: direction.trim(),
            visualStyle,
            referenceCount: generated.referenceCount,
            solModel: generated.solModel
          }
        })
      });
      const linked = await requestJson<{ background: SavedBackground }>(`/api/admin/creative-projects/${projectId}/artwork`, {
        method: "POST",
        body: JSON.stringify({ assetId: uploaded.asset.id, frameId: currentFrame.id, artDirection: direction.trim() })
      });
      const next = [...backgrounds.filter((item) => item.frameId !== currentFrame.id), linked.background];
      setBackgrounds(next);
      setMode("directed");
      applyBackgrounds(root, project, next);
      setMessage(`Art saved to ${project.format === "story" ? "this frame" : "this slide"}. It will be used by preview and final render.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sol could not create the artwork.");
    } finally {
      setWorking("");
    }
  }

  // Single Post already has its dedicated art director inside the persistent
  // artwork renderer. This component restores the missing per-frame controls
  // for Carousel and Story without duplicating the Single Post surface.
  if (!target || !project || project.format === "single" || !currentFrame) return null;
  const noun = project.format === "story" ? "Frame" : "Slide";

  return createPortal(
    <section className="single-art-director sequence-art-director" aria-label={`${noun} art generator`}>
      <div className="single-art-director-head">
        <div>
          <span>SOL ART DIRECTION</span>
          <strong>{noun} {currentFrame.order} visual layer</strong>
          <small>Generate art for this {noun.toLowerCase()} only. Typography, Scripture, logo, layout, and Manual Edit remain live.</small>
        </div>
        <span className="single-art-reference-badge">STYLE REFERENCES ON</span>
      </div>

      <div className="single-art-mode" role="group" aria-label={`${noun} art mode`}>
        <button type="button" className={mode === "template" ? "is-active" : ""} disabled={Boolean(working)} onClick={() => void useTemplate()}>Template</button>
        <button type="button" className={mode === "directed" ? "is-active" : ""} disabled={Boolean(working)} onClick={() => setMode("directed")}>Art-directed</button>
      </div>

      <div className="sequence-art-recommendation">
        <div>
          <strong>{recommendation ? `Sol recommends ${recommendation.mode}` : "Need a visual here?"}</strong>
          <small>{message || "Sol can evaluate the current copy before you spend a generation on it."}</small>
        </div>
        <button type="button" disabled={Boolean(working)} onClick={() => void recommend()}>{working === "recommend" ? <Loader2 className="spin" size={13}/> : <Sparkles size={13}/>} Evaluate</button>
      </div>

      {mode === "directed" ? <div className="single-art-fields">
        <label>Flavor<select value={visualStyle} disabled={Boolean(working)} onChange={(event) => setVisualStyle(event.target.value as VisualStyle)}><option value="street">Street campaign</option><option value="editorial">Clean editorial</option><option value="cinematic">Cinematic campaign</option><option value="verse">Verse connection</option><option value="manifesto">Manifesto</option></select></label>
        <label>Direction<textarea rows={4} value={direction} disabled={Boolean(working)} onChange={(event) => setDirection(event.target.value)} placeholder="Describe the visual substrate, subject, atmosphere, framing, and negative space. Do not ask the image model to draw the text."/></label>
        <button type="button" className="single-art-generate" disabled={Boolean(working) || loading || direction.trim().length < 3} onClick={() => void generate()}>{working === "generate" ? <><Loader2 className="spin" size={15}/> Sol is generating…</> : <><ImageIcon size={15}/> {currentBackground?.previewUrl ? "Regenerate this visual" : "Generate this visual"}</>}</button>
        <p className="sequence-art-note">Generated imagery is attached to this exact project frame. Switching slides will not overwrite the others.</p>
      </div> : <p className="single-art-template-note">Use the selected template and Manual Edit controls, or switch to Art-directed for a custom visual layer.</p>}

      {loading ? <p className="single-art-loading"><Loader2 className="spin" size={13}/> Loading saved art…</p> : null}
      {error ? <p className="single-art-error">{error}</p> : null}
    </section>,
    target
  );
}

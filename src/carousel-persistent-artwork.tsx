"use client";

import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  prompt?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
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

function snapshotFromNode(source: HTMLElement, target: HTMLElement, total: number, fallbackOrder: number): Snapshot {
  const eyebrow = source.querySelector<HTMLElement>(":scope > .creative-preview-eyebrow")?.textContent?.trim() || "Apostolic Guide";
  const numberMatch = eyebrow.match(/(?:·|\s)(\d{1,2})$/);
  const pathway = eyebrow.replace(/\s*·\s*\d{1,2}\s*$/, "").trim() || "Apostolic Guide";
  const format = source.classList.contains("is-story") ? "story" : source.classList.contains("is-single") ? "single" : "carousel";
  return {
    node: target,
    order: Number(numberMatch?.[1] || fallbackOrder),
    total,
    pathway,
    title: source.querySelector<HTMLElement>(":scope > .creative-preview-copy > h2")?.textContent?.trim() || "Untitled frame",
    scripture: source.querySelector<HTMLElement>(":scope > .creative-preview-copy > .creative-preview-scripture")?.textContent?.trim() || "",
    body: source.querySelector<HTMLElement>(":scope > .creative-preview-copy > p")?.textContent?.trim() || "",
    overlay: source.querySelector<HTMLElement>(":scope > .creative-preview-copy > blockquote")?.textContent?.trim() || "",
    cta: source.querySelector<HTMLElement>(":scope > .creative-preview-cta")?.textContent?.trim() || "",
    format
  };
}

function readSnapshots(root: HTMLElement): Snapshot[] {
  const hiddenNodes = [...root.querySelectorAll<HTMLElement>(".creative-render-stage > .creative-frame-preview")];
  const total = Math.max(1, hiddenNodes.length);
  const hiddenSnapshots = hiddenNodes.map((node, index) => snapshotFromNode(node, node, total, index + 1));

  const visibleNode = root.querySelector<HTMLElement>(".creative-preview-panel .creative-frame-preview");
  const railRows = [...root.querySelectorAll<HTMLElement>(".creative-frame-row")];
  const activeIndex = Math.max(0, railRows.findIndex((row) => row.classList.contains("is-active")));
  const selectedSource = hiddenNodes[activeIndex] || visibleNode;
  const visibleSnapshot = visibleNode && selectedSource
    ? snapshotFromNode(selectedSource, visibleNode, total, activeIndex + 1)
    : null;

  return visibleSnapshot ? [visibleSnapshot, ...hiddenSnapshots] : hiddenSnapshots;
}

function OriginalArtwork({ frame, visualStyle, alignment, backgroundUrl }: { frame: Snapshot; visualStyle: VisualStyle; alignment: "left" | "center" | "right"; backgroundUrl?: string | null }) {
  const lightSurface = visualStyle === "editorial" || visualStyle === "verse";
  const logo = lightSurface && !backgroundUrl ? "/brand/apostolic-guide-mark.png" : "/brand/apostolic-guide-mark-reversed.png";
  const kind = frame.order === 1 ? "cover" : frame.cta || frame.order === frame.total ? "cta" : frame.scripture ? "scripture" : "statement";
  const artStyle = {
    "--carousel-grain": backgroundUrl ? .7 : .62,
    "--copy-y": kind === "cover" ? "49%" : "50%",
    "--headline-scale": 1,
    "--body-scale": 1,
    "--body-width": visualStyle === "editorial" ? "82%" : "76%",
    "--title-width": "90%",
    "--copy-align": alignment,
    "--copy-gap": "2.4cqw"
  } as CSSProperties;

  return <div className={`persistent-carousel-artboard carousel-artboard is-${visualStyle} is-${kind} ${frame.format === "story" ? "is-vertical" : "is-portrait"} ${backgroundUrl ? "has-generated-background" : ""}`}>
    <div className="carousel-artwork" style={artStyle}>
      {backgroundUrl ? <div className="carousel-generated-background" style={{ backgroundImage: `url(${JSON.stringify(backgroundUrl)})` }}/>: null}
      <div className="carousel-ambient carousel-ambient-red"/>
      <div className="carousel-ambient carousel-ambient-blue"/>
      <div className="carousel-paper-wear"/>
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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export function CarouselPersistentArtwork() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [frames, setFrames] = useState<Snapshot[]>([]);
  const [template, setTemplate] = useState("street-theology");
  const [alignment, setAlignment] = useState<"left" | "center" | "right">("center");
  const [signature, setSignature] = useState("");
  const [artHost, setArtHost] = useState<HTMLElement | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectArtworkInfo | null>(null);
  const [backgrounds, setBackgrounds] = useState<SavedBackground[]>([]);
  const [artMode, setArtMode] = useState<"template" | "directed">("template");
  const [artDirection, setArtDirection] = useState("");
  const [artStyle, setArtStyle] = useState<"street" | "editorial" | "cinematic">("street");
  const [artWorking, setArtWorking] = useState(false);
  const [artError, setArtError] = useState("");

  const projectId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("project");
  }, []);

  const loadArtwork = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await requestJson<{ project: ProjectArtworkInfo; backgrounds: SavedBackground[] }>(`/api/admin/creative-projects/${projectId}/artwork`);
      setProjectInfo(data.project);
      setBackgrounds(data.backgrounds.filter((item) => Boolean(item.previewUrl)));
      if (data.project.format === "single" && data.backgrounds.some((item) => item.order === 1 && item.previewUrl)) setArtMode("directed");
      const savedDirection = data.backgrounds.find((item) => item.order === 1)?.metadata?.artDirection;
      if (typeof savedDirection === "string") setArtDirection(savedDirection);
    } catch (error) {
      setArtError(error instanceof Error ? error.message : "Saved artwork could not be loaded.");
    }
  }, [projectId]);

  useEffect(() => { void loadArtwork(); }, [loadArtwork]);

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

        const visualControls = current.querySelector<HTMLElement>(".creative-preview-panel .creative-visual-controls");
        if (visualControls) {
          let mount = current.querySelector<HTMLElement>("[data-single-art-director-host]");
          if (!mount) {
            mount = document.createElement("div");
            mount.dataset.singleArtDirectorHost = "true";
            visualControls.after(mount);
          }
          setArtHost(mount);
        }
      }, 20);
    };
    sync();
    document.addEventListener("change", sync, true);
    document.addEventListener("input", sync, true);
    document.addEventListener("click", sync, true);
    const observer = new MutationObserver(sync);
    observer.observe(current, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-creative-template", "class"] });
    return () => {
      window.clearTimeout(scheduled);
      document.removeEventListener("change", sync, true);
      document.removeEventListener("input", sync, true);
      document.removeEventListener("click", sync, true);
      observer.disconnect();
    };
  }, []);

  const style = useMemo(() => styleForTemplate(template), [template]);
  const backgroundByOrder = useMemo(() => new Map(backgrounds.map((item) => [item.order, item.previewUrl])), [backgrounds]);
  const selected = frames[0] || null;
  const selectedFrameInfo = selected ? projectInfo?.frames.find((frame) => frame.order === selected.order) || null : null;

  async function useTemplateMode() {
    setArtMode("template");
    setArtError("");
    if (!projectId || !selectedFrameInfo) return;
    try {
      await requestJson(`/api/admin/creative-projects/${projectId}/artwork`, {
        method: "DELETE",
        body: JSON.stringify({ frameId: selectedFrameInfo.id })
      });
      setBackgrounds((current) => current.filter((item) => item.frameId !== selectedFrameInfo.id));
    } catch (error) {
      setArtError(error instanceof Error ? error.message : "Template mode could not be restored.");
    }
  }

  async function generateDirectedArt() {
    if (!projectId || !projectInfo || !selectedFrameInfo || artDirection.trim().length < 3) return;
    setArtWorking(true);
    setArtError("");
    try {
      const generated = await requestJson<{ dataUrl: string; prompt: string; solModel: string; imageModel: string; referenceCount: number }>("/api/admin/pathway-assets/generate-image", {
        method: "POST",
        body: JSON.stringify({
          pathwaySlug: projectInfo.pathwaySlug,
          creationType: "single-post",
          visualStyle: artStyle,
          prompt: artDirection.trim(),
          orientation: "portrait",
          quality: "medium"
        })
      });
      const uploaded = await requestJson<{ asset: { id: string; preview_url?: string | null } }>("/api/admin/pathway-assets/upload", {
        method: "POST",
        body: JSON.stringify({
          pathwaySlug: projectInfo.pathwaySlug,
          studio: "carousel",
          assetType: "generated-image",
          title: `${projectInfo.title} · Sol art background`,
          dataUrl: generated.dataUrl,
          sourceType: "generated",
          prompt: generated.prompt,
          model: generated.imageModel,
          metadata: {
            creativeProjectId: projectId,
            frameId: selectedFrameInfo.id,
            artDirection: artDirection.trim(),
            visualStyle: artStyle,
            referenceCount: generated.referenceCount,
            solModel: generated.solModel
          }
        })
      });
      const linked = await requestJson<{ background: SavedBackground }>(`/api/admin/creative-projects/${projectId}/artwork`, {
        method: "POST",
        body: JSON.stringify({ assetId: uploaded.asset.id, frameId: selectedFrameInfo.id, artDirection: artDirection.trim() })
      });
      setBackgrounds((current) => [...current.filter((item) => item.frameId !== selectedFrameInfo.id), linked.background]);
      setArtMode("directed");
    } catch (error) {
      setArtError(error instanceof Error ? error.message : "Sol could not create the art direction.");
    } finally {
      setArtWorking(false);
    }
  }

  const artDirector = projectInfo?.format === "single" && selectedFrameInfo ? <section className="single-art-director">
    <div className="single-art-director-head">
      <div><span>SOL ART DIRECTION</span><strong>Single graphic design</strong><small>Keep the normal template, or direct a high-detail visual layer from your saved Apostolic Guide references.</small></div>
      <span className="single-art-reference-badge">STYLE REFERENCES ON</span>
    </div>
    <div className="single-art-mode" role="group" aria-label="Single post art mode">
      <button type="button" className={artMode === "template" ? "is-active" : ""} onClick={() => void useTemplateMode()}>Template</button>
      <button type="button" className={artMode === "directed" ? "is-active" : ""} onClick={() => setArtMode("directed")}>Art-directed</button>
    </div>
    {artMode === "directed" ? <div className="single-art-fields">
      <label>Flavor<select value={artStyle} onChange={(event) => setArtStyle(event.target.value as typeof artStyle)}><option value="street">Street campaign</option><option value="editorial">Clean editorial</option><option value="cinematic">Cinematic campaign</option></select></label>
      <label>Direction<textarea rows={4} value={artDirection} onChange={(event) => setArtDirection(event.target.value)} placeholder="Example: rough subway-poster energy, clean but gritty, dramatic side light, premium sports-ad tension, huge negative space for the headline."/></label>
      <button type="button" className="single-art-generate" disabled={artWorking || artDirection.trim().length < 3} onClick={() => void generateDirectedArt()}>{artWorking ? "Sol is directing the art…" : backgroundByOrder.get(selected.order) ? "Regenerate art" : "Generate art with Sol"}</button>
      <p>Sol uses saved Apostolic Guide style references and generates the visual layer only. Typography, Scripture, logo, and layout stay editable in Carousel Studio.</p>
    </div> : <p className="single-art-template-note">Uses the selected Carousel Studio template, including the restored paper, grain, ink, and ambient texture layers.</p>}
    {artError ? <p className="single-art-error">{artError}</p> : null}
  </section> : null;

  if (!root || !signature) return null;
  return <>
    {frames.map((frame, index) => createPortal(<OriginalArtwork frame={frame} visualStyle={style} alignment={alignment} backgroundUrl={backgroundByOrder.get(frame.order)}/>, frame.node, `persistent-artwork-${index}-${frame.order}`))}
    {artHost && artDirector ? createPortal(artDirector, artHost) : null}
  </>;
}

"use client";

import { createPortal } from "react-dom";
import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function applyBackground(previewUrl: string | null) {
  const boards = [...document.querySelectorAll<HTMLElement>(".carousel-studio-master .persistent-carousel-artboard")];
  for (const board of boards) {
    const artwork = board.querySelector<HTMLElement>(".carousel-artwork");
    if (!artwork) continue;
    let layer = artwork.querySelector<HTMLElement>(":scope > .carousel-generated-background");
    if (!previewUrl) {
      layer?.remove();
      board.classList.remove("has-generated-background");
      continue;
    }
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "carousel-generated-background";
      artwork.prepend(layer);
    }
    layer.style.backgroundImage = `url(${JSON.stringify(previewUrl)})`;
    board.classList.add("has-generated-background");
  }
}

export function CarouselSingleArtDirector() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [project, setProject] = useState<ProjectArtworkInfo | null>(null);
  const [background, setBackground] = useState<SavedBackground | null>(null);
  const [mode, setMode] = useState<"template" | "directed">("template");
  const [direction, setDirection] = useState("");
  const [visualStyle, setVisualStyle] = useState<"street" | "editorial" | "cinematic">("street");
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const projectId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("project") || "";
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const data = await requestJson<{ project: ProjectArtworkInfo; backgrounds: SavedBackground[] }>(`/api/admin/creative-projects/${projectId}/artwork`);
      setProject(data.project);
      if (data.project.format !== "single") {
        setBackground(null);
        return;
      }
      const saved = data.backgrounds.find((item) => item.order === 1 && item.previewUrl) || null;
      setBackground(saved);
      setMode(saved ? "directed" : "template");
      const savedDirection = saved?.metadata?.artDirection;
      if (typeof savedDirection === "string") setDirection(savedDirection);
      const savedStyle = saved?.metadata?.visualStyle;
      if (savedStyle === "street" || savedStyle === "editorial" || savedStyle === "cinematic") setVisualStyle(savedStyle);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sol art tools could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let disposed = false;
    const syncTarget = () => {
      if (disposed) return;
      const next = document.querySelector<HTMLElement>(".carousel-studio-master .creative-preview-panel");
      setTarget((current) => current === next ? current : next);
    };
    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (project?.format !== "single") return;
    const sync = () => applyBackground(background?.previewUrl || null);
    sync();
    const root = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
    if (!root) return;
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [background?.previewUrl, project?.format]);

  async function useTemplate() {
    if (!projectId || !project?.frames[0]) return;
    setWorking(true);
    setError("");
    try {
      await requestJson(`/api/admin/creative-projects/${projectId}/artwork`, {
        method: "DELETE",
        body: JSON.stringify({ frameId: project.frames[0].id })
      });
      setBackground(null);
      setMode("template");
      applyBackground(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Template mode could not be restored.");
    } finally {
      setWorking(false);
    }
  }

  async function generate() {
    const frame = project?.frames[0];
    if (!projectId || !project || !frame || direction.trim().length < 3) return;
    setWorking(true);
    setError("");
    try {
      const generated = await requestJson<{ dataUrl: string; prompt: string; solModel: string; imageModel: string; referenceCount: number }>("/api/admin/pathway-assets/generate-image", {
        method: "POST",
        body: JSON.stringify({
          pathwaySlug: project.pathwaySlug,
          creationType: "single-post",
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
          title: `${project.title} · Sol art background`,
          dataUrl: generated.dataUrl,
          sourceType: "generated",
          prompt: generated.prompt,
          model: generated.imageModel,
          metadata: {
            creativeProjectId: projectId,
            frameId: frame.id,
            artDirection: direction.trim(),
            visualStyle,
            referenceCount: generated.referenceCount,
            solModel: generated.solModel
          }
        })
      });
      const linked = await requestJson<{ background: SavedBackground }>(`/api/admin/creative-projects/${projectId}/artwork`, {
        method: "POST",
        body: JSON.stringify({ assetId: uploaded.asset.id, frameId: frame.id, artDirection: direction.trim() })
      });
      setBackground(linked.background);
      setMode("directed");
      applyBackground(linked.background.previewUrl || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sol could not create the artwork.");
    } finally {
      setWorking(false);
    }
  }

  if (!target || project?.format !== "single") return null;

  return createPortal(
    <section className="single-art-director single-sol-director" aria-label="Sol single-post art generator">
      <div className="single-art-director-head">
        <div>
          <span>SOL ART DIRECTION</span>
          <strong>Generate the single-post artwork</strong>
          <small>Sol creates the visual layer from your Apostolic Guide references. Type, Scripture, logo, and layout stay editable.</small>
        </div>
        <span className="single-art-reference-badge">STYLE REFERENCES ON</span>
      </div>

      <div className="single-art-mode" role="group" aria-label="Single post art mode">
        <button type="button" className={mode === "template" ? "is-active" : ""} disabled={working} onClick={() => void useTemplate()}>Template</button>
        <button type="button" className={mode === "directed" ? "is-active" : ""} disabled={working} onClick={() => setMode("directed")}>Art-directed</button>
      </div>

      {mode === "directed" ? <div className="single-art-fields">
        <label>Flavor<select value={visualStyle} disabled={working} onChange={(event) => setVisualStyle(event.target.value as typeof visualStyle)}><option value="street">Street campaign</option><option value="editorial">Clean editorial</option><option value="cinematic">Cinematic campaign</option></select></label>
        <label>Direction<textarea rows={4} value={direction} disabled={working} onChange={(event) => setDirection(event.target.value)} placeholder="Example: names of God filling the frame, JESUS cutting vertically through the center, rough premium poster texture, blue/crimson brand light, strong negative space."/></label>
        <button type="button" className="single-art-generate" disabled={working || loading || direction.trim().length < 3} onClick={() => void generate()}>{working ? <><Loader2 className="spin" size={15}/> Sol is generating…</> : <><Sparkles size={15}/> {background?.previewUrl ? "Regenerate art with Sol" : "Generate art with Sol"}</>}</button>
        <p>The generated image is saved to the Creative Project and used by the preview and final render.</p>
      </div> : <p className="single-art-template-note">Use the selected Carousel Studio template, or switch to Art-directed to generate a custom visual with Sol.</p>}

      {loading ? <p className="single-art-loading"><Loader2 className="spin" size={13}/> Loading Sol art tools…</p> : null}
      {error ? <p className="single-art-error">{error}</p> : null}
    </section>,
    target
  );
}

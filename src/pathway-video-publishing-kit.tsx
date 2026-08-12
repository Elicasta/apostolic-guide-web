"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Download, Image as ImageIcon, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import {
  EMPTY_PATHWAY_VIDEO_PUBLISHING_METADATA,
  normalizePathwayVideoPublishingMetadata,
  type PathwayVideoPublishingMetadata
} from "@/pathway-video-publishing";

type PublishingKitRow = {
  pathway_slug: string;
  audio_content_hash: string | null;
  metadata: unknown;
  thumbnail_background_url: string | null;
  thumbnail_storage_path: string | null;
  text_model: string | null;
  image_model: string | null;
  image_quality: string | null;
  updated_at: string;
};

const THUMBNAIL_WIDTH = 1280;
const THUMBNAIL_HEIGHT = 720;
const SHARP_EXPORT_SCALE = 2;

function arrayText(values: string[]) {
  return values.join(", ");
}

function parseList(value: string) {
  return [...new Set(value.split(/[,\n]+/).map((item) => item.trim()).filter(Boolean))];
}

async function imageFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image could not be loaded (${response.status}).`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image could not be decoded."));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function wrappedLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const proposed = current ? `${current} ${word}` : word;
    if (!current || context.measureText(proposed).width <= maxWidth) current = proposed;
    else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

async function loadThumbnailFonts() {
  if (!("fonts" in document)) return;
  await Promise.allSettled([
    document.fonts.load('700 88px "Montserrat"'),
    document.fonts.load('600 28px "Montserrat"'),
    document.fonts.load('600 21px "Montserrat"')
  ]);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Thumbnail could not be encoded.")), type, quality);
  });
}

function drawThumbnailComposition(input: {
  background: HTMLImageElement;
  logo: HTMLImageElement;
  metadata: PathwayVideoPublishingMetadata;
  title: string;
  scale: number;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH * input.scale;
  canvas.height = THUMBNAIL_HEIGHT * input.scale;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Thumbnail canvas is unavailable.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.scale(input.scale, input.scale);
  drawCover(context, input.background, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

  const leftShade = context.createLinearGradient(0, 0, 900, 0);
  leftShade.addColorStop(0, "rgba(5,8,11,.94)");
  leftShade.addColorStop(.48, "rgba(5,8,11,.64)");
  leftShade.addColorStop(1, "rgba(5,8,11,0)");
  context.fillStyle = leftShade;
  context.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

  const bottomShade = context.createLinearGradient(0, 380, 0, THUMBNAIL_HEIGHT);
  bottomShade.addColorStop(0, "rgba(0,0,0,0)");
  bottomShade.addColorStop(1, "rgba(0,0,0,.48)");
  context.fillStyle = bottomShade;
  context.fillRect(0, 300, THUMBNAIL_WIDTH, 420);

  const logoWidth = 300;
  const logoHeight = input.logo.naturalHeight * (logoWidth / input.logo.naturalWidth);
  context.drawImage(input.logo, 72, 66, logoWidth, logoHeight);

  context.textBaseline = "alphabetic";
  context.fillStyle = "#f7f4ed";
  context.font = '700 88px "Montserrat", Arial, sans-serif';
  const headline = input.metadata.thumbnailText.toUpperCase() || input.title.toUpperCase();
  const lines = wrappedLines(context, headline, 590, 3);
  const lineHeight = 88;
  const startY = 270 - Math.max(0, lines.length - 2) * 24;
  lines.forEach((line, index) => context.fillText(line, 72, startY + index * lineHeight));

  if (input.metadata.thumbnailSubline) {
    context.fillStyle = "#cbd1d6";
    context.font = '600 28px "Montserrat", Arial, sans-serif';
    context.fillText(input.metadata.thumbnailSubline.toUpperCase().slice(0, 58), 76, Math.min(590, startY + lines.length * lineHeight + 28));
  }

  context.fillStyle = "#d7dce1";
  context.font = '600 21px "Montserrat", Arial, sans-serif';
  context.fillText(`${input.title.toUpperCase()} · PATHWAY`, 76, 650);

  return canvas;
}

export function PathwayVideoPublishingKit({ slug, title }: { slug: string; title: string }) {
  const [kit, setKit] = useState<PublishingKitRow | null>(null);
  const [metadata, setMetadata] = useState<PathwayVideoPublishingMetadata>(EMPTY_PATHWAY_VIDEO_PUBLISHING_METADATA);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch(`/api/admin/video-studio/publishing-kit?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Publishing kit could not be loaded.");
      const row = data.kit as PublishingKitRow | null;
      setKit(row);
      setMetadata(row ? normalizePathwayVideoPublishingMetadata(row.metadata) : EMPTY_PATHWAY_VIDEO_PUBLISHING_METADATA);
    } catch (error) {
      setKit(null);
      setMetadata(EMPTY_PATHWAY_VIDEO_PUBLISHING_METADATA);
      setMessage(error instanceof Error ? error.message : "Publishing kit could not be loaded.");
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  function update<K extends keyof PathwayVideoPublishingMetadata>(key: K, value: PathwayVideoPublishingMetadata[K]) {
    setMetadata((current) => ({ ...current, [key]: value }));
  }

  async function persistCopy() {
    const response = await fetch("/api/admin/video-studio/publishing-kit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, action: "save", metadata })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Publishing copy could not be saved.");
    const row = data.kit as PublishingKitRow;
    setKit(row);
    return row;
  }

  async function generateCopy() {
    setBusy("generate-copy");
    setMessage("GPT-5.6 Sol is building the publishing package from the approved narration…");
    try {
      const response = await fetch("/api/admin/video-studio/publishing-kit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, action: "generate" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Publishing copy could not be generated.");
      const row = data.kit as PublishingKitRow;
      setKit(row);
      setMetadata(normalizePathwayVideoPublishingMetadata(row.metadata));
      setMessage("Publishing copy ready. Review it, then generate the thumbnail background.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publishing copy could not be generated.");
    } finally {
      setBusy(null);
    }
  }

  async function saveCopy() {
    setBusy("save-copy");
    setMessage("");
    try {
      await persistCopy();
      setMessage("Publishing copy saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publishing copy could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function generateThumbnail(quality: "low" | "medium" = "low") {
    setBusy("thumbnail");
    setMessage(quality === "low" ? "Generating the low-cost thumbnail background…" : "Generating a higher-quality thumbnail background…");
    try {
      await persistCopy();
      const response = await fetch("/api/admin/video-studio/thumbnail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, quality })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Thumbnail could not be generated.");
      setKit(data.kit as PublishingKitRow);
      setMessage(`Thumbnail background ready · ${quality} quality. The final text and logo are rendered by Apostolic Guide, not the image model.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Thumbnail could not be generated.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadThumbnail(mode: "sharp" | "compact" = "sharp") {
    if (!kit?.thumbnail_background_url) return;
    setBusy("download-thumbnail");
    setMessage("");
    try {
      await loadThumbnailFonts();
      const [background, logo] = await Promise.all([
        imageFromUrl(kit.thumbnail_background_url),
        imageFromUrl("/brand/apostolic-guide-wordmark-reversed.png")
      ]);

      const scale = mode === "sharp" ? SHARP_EXPORT_SCALE : 1;
      const canvas = drawThumbnailComposition({ background, logo, metadata, title, scale });
      const blob = await canvasBlob(canvas, "image/jpeg", mode === "sharp" ? .96 : .94);
      downloadBlob(blob, `${slug}-youtube-thumbnail-${mode === "sharp" ? "2560x1440" : "1280x720"}.jpg`);
      setMessage(mode === "sharp"
        ? "Sharp 2560 × 1440 thumbnail exported. Text and logo were rendered at 2× native resolution."
        : "Compact 1280 × 720 thumbnail exported.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Thumbnail could not be exported.");
    } finally {
      setBusy(null);
    }
  }

  const thumbnailStyle = kit?.thumbnail_background_url ? { backgroundImage: `url(${kit.thumbnail_background_url})` } : undefined;

  return <section className="admin-card video-publishing-kit">
    <div className="video-card-heading">
      <div><span className="section-kicker">Distribution intelligence</span><h2>Publishing kit</h2></div>
      <div className="video-kit-actions">
        <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void generateCopy()}>{busy === "generate-copy" ? <Loader2 className="spin" size={15}/> : <Sparkles size={15}/>} Generate with GPT-5.6 Sol</button>
        <button type="button" className="button" disabled={Boolean(busy) || !metadata.youtubeTitle} onClick={() => void saveCopy()}>{busy === "save-copy" ? <Loader2 className="spin" size={15}/> : <Save size={15}/>} Save copy</button>
      </div>
    </div>
    {message ? <div className="admin-notice video-kit-notice">{message}</div> : null}

    <div className="video-kit-grid">
      <div className="video-kit-copy">
        <label><span>YouTube title</span><div className="video-kit-field"><input value={metadata.youtubeTitle} onChange={(event) => update("youtubeTitle", event.target.value)}/><button type="button" aria-label="Copy YouTube title" onClick={() => void copyText(metadata.youtubeTitle)}><Copy size={14}/></button></div><small>{metadata.youtubeTitle.length}/100</small></label>
        <label><span>YouTube description</span><div className="video-kit-field"><textarea rows={10} value={metadata.youtubeDescription} onChange={(event) => update("youtubeDescription", event.target.value)}/><button type="button" aria-label="Copy YouTube description" onClick={() => void copyText(metadata.youtubeDescription)}><Copy size={14}/></button></div></label>
        <label><span>YouTube tags</span><textarea rows={3} value={arrayText(metadata.youtubeTags)} onChange={(event) => update("youtubeTags", parseList(event.target.value))}/></label>
        <label><span>YouTube hashtags</span><textarea rows={2} value={arrayText(metadata.youtubeHashtags)} onChange={(event) => update("youtubeHashtags", parseList(event.target.value))}/></label>
        <label><span>Shorts title</span><input value={metadata.shortsTitle} onChange={(event) => update("shortsTitle", event.target.value)}/></label>
        <label><span>Instagram Reel caption</span><textarea rows={6} value={metadata.reelCaption} onChange={(event) => update("reelCaption", event.target.value)}/></label>
        <label><span>TikTok caption</span><textarea rows={5} value={metadata.tiktokCaption} onChange={(event) => update("tiktokCaption", event.target.value)}/></label>
        <label><span>Social hashtags</span><textarea rows={2} value={arrayText(metadata.socialHashtags)} onChange={(event) => update("socialHashtags", parseList(event.target.value))}/></label>
        <label><span>SEO keywords</span><textarea rows={3} value={arrayText(metadata.seoKeywords)} onChange={(event) => update("seoKeywords", parseList(event.target.value))}/></label>
      </div>

      <div className="video-kit-thumbnail-column">
        <div className="video-thumbnail-preview" style={thumbnailStyle}>
          <div className="video-thumbnail-shade"/>
          <img src="/brand/apostolic-guide-wordmark-reversed.png" alt="Apostolic Guide"/>
          <div className="video-thumbnail-copy"><strong>{metadata.thumbnailText || "THUMBNAIL HOOK"}</strong>{metadata.thumbnailSubline ? <span>{metadata.thumbnailSubline}</span> : null}</div>
          <small>{title.toUpperCase()} · PATHWAY</small>
        </div>
        <div className="video-thumbnail-controls">
          <label><span>Thumbnail text</span><input value={metadata.thumbnailText} onChange={(event) => update("thumbnailText", event.target.value)}/></label>
          <label><span>Subline</span><input value={metadata.thumbnailSubline} onChange={(event) => update("thumbnailSubline", event.target.value)}/></label>
          <label><span>Visual brief</span><textarea rows={5} value={metadata.thumbnailVisualBrief} onChange={(event) => update("thumbnailVisualBrief", event.target.value)}/></label>
          <label><span>Image prompt</span><textarea rows={7} value={metadata.thumbnailImagePrompt} onChange={(event) => update("thumbnailImagePrompt", event.target.value)}/></label>
          <div className="video-thumbnail-buttons">
            <button type="button" className="button primary" disabled={Boolean(busy) || !metadata.thumbnailImagePrompt} onClick={() => void generateThumbnail("low")}>{busy === "thumbnail" ? <Loader2 className="spin" size={15}/> : <ImageIcon size={15}/>} {kit?.thumbnail_background_url ? "Regenerate low-cost" : "Generate low-cost background"}</button>
            <button type="button" className="button" disabled={Boolean(busy) || !metadata.thumbnailImagePrompt} onClick={() => void generateThumbnail("medium")}><RefreshCw size={15}/> Better quality</button>
            <button type="button" className="button" disabled={Boolean(busy) || !kit?.thumbnail_background_url} onClick={() => void downloadThumbnail("sharp")}>{busy === "download-thumbnail" ? <Loader2 className="spin" size={15}/> : <Download size={15}/>} Export sharp 2560×1440</button>
            <button type="button" className="button" disabled={Boolean(busy) || !kit?.thumbnail_background_url} onClick={() => void downloadThumbnail("compact")}><Download size={15}/> Export compact 1280×720</button>
          </div>
          <p className="video-thumbnail-model-note">{kit?.image_model ? `${kit.image_model} · ${kit.image_quality ?? "unknown"} quality` : "Background not generated yet."} Text and logo are composited at export resolution so they remain exact and sharp.</p>
        </div>
      </div>
    </div>
  </section>;
}

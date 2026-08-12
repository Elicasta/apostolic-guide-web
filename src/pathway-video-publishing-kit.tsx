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
      const response = await fetch("/api/admin/video-studio/publishing-kit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, action: "save", metadata })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Publishing copy could not be saved.");
      setKit(data.kit as PublishingKitRow);
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
      await saveCopy();
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

  async function downloadThumbnail() {
    if (!kit?.thumbnail_background_url) return;
    setBusy("download-thumbnail");
    setMessage("");
    try {
      const [background, logo] = await Promise.all([
        imageFromUrl(kit.thumbnail_background_url),
        imageFromUrl("/brand/apostolic-guide-wordmark-reversed.png")
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Thumbnail canvas is unavailable.");
      drawCover(context, background, canvas.width, canvas.height);

      const leftShade = context.createLinearGradient(0, 0, 900, 0);
      leftShade.addColorStop(0, "rgba(5,8,11,.92)");
      leftShade.addColorStop(.48, "rgba(5,8,11,.62)");
      leftShade.addColorStop(1, "rgba(5,8,11,0)");
      context.fillStyle = leftShade;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const bottomShade = context.createLinearGradient(0, 380, 0, 720);
      bottomShade.addColorStop(0, "rgba(0,0,0,0)");
      bottomShade.addColorStop(1, "rgba(0,0,0,.45)");
      context.fillStyle = bottomShade;
      context.fillRect(0, 300, canvas.width, 420);

      const logoWidth = 300;
      const logoHeight = logo.naturalHeight * (logoWidth / logo.naturalWidth);
      context.drawImage(logo, 72, 66, logoWidth, logoHeight);

      context.fillStyle = "#f7f4ed";
      context.font = "700 88px Arial, sans-serif";
      const lines = wrappedLines(context, metadata.thumbnailText.toUpperCase() || title.toUpperCase(), 590, 3);
      const lineHeight = 88;
      const startY = 270 - Math.max(0, lines.length - 2) * 24;
      lines.forEach((line, index) => context.fillText(line, 72, startY + index * lineHeight));

      if (metadata.thumbnailSubline) {
        context.fillStyle = "#c6ccd2";
        context.font = "600 28px Arial, sans-serif";
        context.fillText(metadata.thumbnailSubline.toUpperCase().slice(0, 58), 76, Math.min(590, startY + lines.length * lineHeight + 28));
      }
      context.fillStyle = "#d7dce1";
      context.font = "600 21px Arial, sans-serif";
      context.fillText(`${title.toUpperCase()} · PATHWAY`, 76, 650);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .92));
      if (!blob) throw new Error("Thumbnail could not be encoded.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug}-youtube-thumbnail.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("1280 × 720 YouTube thumbnail exported.");
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
            <button type="button" className="button" disabled={Boolean(busy) || !kit?.thumbnail_background_url} onClick={() => void downloadThumbnail()}>{busy === "download-thumbnail" ? <Loader2 className="spin" size={15}/> : <Download size={15}/>} Export 1280×720</button>
          </div>
          <p className="video-thumbnail-model-note">{kit?.image_model ? `${kit.image_model} · ${kit.image_quality ?? "unknown"} quality` : "Background not generated yet."} Text and logo are composited by Apostolic Guide so they remain exact.</p>
        </div>
      </div>
    </div>
  </section>;
}

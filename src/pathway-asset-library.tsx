"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Download, FolderOpen, Image as ImageIcon, Loader2, Pencil, RefreshCw, Share2, Sparkles, Star, Upload } from "lucide-react";

type Studio = "carousel" | "video";
type StudioScope = "all" | Studio;
type PathwayAsset = {
  id: string;
  pathway_slug: string;
  studio: Studio;
  asset_type: string;
  parent_asset_id: string | null;
  title: string;
  status: string;
  source_type: string;
  editable: boolean;
  version: number;
  content: Record<string, unknown>;
  storage_bucket: string | null;
  storage_path: string | null;
  public_url: string | null;
  preview_url?: string | null;
  prompt: string | null;
  model: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
};

type GeneratedImage = { dataUrl: string; prompt: string; solModel: string; imageModel: string; size: string; referenceCount?: number };

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

function assetGroup(type: string) {
  if (type === "caption") return "copy";
  if (type.includes("image") || type.includes("slide") || type.includes("post") || type.includes("story") || type.includes("thumbnail")) return "visual";
  if (type.includes("render") || type.includes("project") || type.includes("deck") || type.includes("set")) return "output";
  return "other";
}

function calendarType(asset: PathwayAsset) {
  if (asset.asset_type === "carousel-deck") return "carousel";
  if (asset.asset_type === "story-set" || asset.asset_type === "story-frame") return "story";
  if (asset.asset_type === "single-post") return "post";
  if (asset.asset_type.includes("thumbnail")) return "thumbnail";
  if (asset.asset_type === "video-render") return "video";
  if (asset.asset_type.includes("image")) return "image";
  return null;
}

function filenameFromDisposition(value: string | null, fallback: string) {
  const quoted = value?.match(/filename="([^"]+)"/i)?.[1];
  const plain = value?.match(/filename=([^;]+)/i)?.[1]?.trim();
  return quoted || plain || fallback;
}

export function PathwayAssetLibrary({
  pathwaySlug,
  pathwayTitle,
  studio,
  aiReady,
  onOpenAsset
}: {
  pathwaySlug: string;
  pathwayTitle: string;
  studio: Studio;
  aiReady: boolean;
  onOpenAsset?: (asset: PathwayAsset) => void;
}) {
  const [assets, setAssets] = useState<PathwayAsset[]>([]);
  const [studioScope, setStudioScope] = useState<StudioScope>("all");
  const [filter, setFilter] = useState<"all" | "visual" | "copy" | "output">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageType, setImageType] = useState<"single-post" | "story" | "thumbnail" | "background">(studio === "video" ? "thumbnail" : "single-post");
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setImageType(studio === "video" ? "thumbnail" : "single-post");
  }, [studio]);

  const visible = useMemo(() => assets.filter((asset) => {
    if (studioScope !== "all" && asset.studio !== studioScope) return false;
    return filter === "all" || assetGroup(asset.asset_type) === filter;
  }), [assets, filter, studioScope]);
  const parentCount = assets.filter((asset) => !asset.parent_asset_id).length;
  const carouselCount = assets.filter((asset) => asset.studio === "carousel").length;
  const videoCount = assets.filter((asset) => asset.studio === "video").length;

  async function refresh() {
    if (!pathwaySlug) return;
    setBusy("load");
    try {
      const [carouselResponse, videoResponse] = await Promise.all([
        fetch(`/api/admin/pathway-assets?pathwaySlug=${encodeURIComponent(pathwaySlug)}&studio=carousel`, { cache: "no-store" }),
        fetch(`/api/admin/pathway-assets?pathwaySlug=${encodeURIComponent(pathwaySlug)}&studio=video`, { cache: "no-store" })
      ]);
      const [carouselData, videoData] = await Promise.all([
        carouselResponse.json().catch(() => ({})),
        videoResponse.json().catch(() => ({}))
      ]);
      if (!carouselResponse.ok) throw new Error(carouselData.error || "Carousel assets could not be loaded.");
      if (!videoResponse.ok) throw new Error(videoData.error || "Video assets could not be loaded.");
      setAssets([
        ...(Array.isArray(carouselData.assets) ? carouselData.assets : []),
        ...(Array.isArray(videoData.assets) ? videoData.assets : [])
      ].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Assets could not be loaded.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => { void refresh(); }, [pathwaySlug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadManual(file: File) {
    setBusy("upload");
    setMessage(`Uploading to ${pathwayTitle} → ${studio === "carousel" ? "Carousel Studio" : "Video Studio"}…`);
    try {
      const dataUrl = await fileToDataUrl(file);
      const response = await fetch("/api/admin/pathway-assets/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pathwaySlug, studio, assetType: "uploaded-image", title: file.name.replace(/\.[^.]+$/, ""), dataUrl, sourceType: "uploaded", metadata: { originalFilename: file.name } })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      setMessage("Uploaded. It now belongs to this Pathway and can be reused later.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function generateImage() {
    if (!aiReady || imagePrompt.trim().length < 3) return;
    setBusy("generate");
    setMessage("Sol is directing the image from your saved Apostolic Guide style…");
    try {
      const orientation = imageType === "thumbnail" ? "landscape" : "portrait";
      const response = await fetch("/api/admin/pathway-assets/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pathwaySlug, creationType: imageType, visualStyle: "editorial", prompt: imagePrompt, orientation, quality: "low" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Image generation failed.");
      setGenerated(data as GeneratedImage);
      setMessage(`Image ready${Number(data.referenceCount || 0) ? ` · ${data.referenceCount} saved style reference${Number(data.referenceCount) === 1 ? "" : "s"} used` : ""}. Save it to keep it in this Pathway folder.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image generation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveGenerated() {
    if (!generated) return;
    setBusy("save-image");
    try {
      const assetType = imageType === "thumbnail" ? "thumbnail" : "generated-image";
      const response = await fetch("/api/admin/pathway-assets/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pathwaySlug,
          studio,
          assetType,
          title: `${pathwayTitle} ${imageType}`,
          dataUrl: generated.dataUrl,
          sourceType: "generated",
          prompt: generated.prompt,
          model: generated.imageModel,
          metadata: { solModel: generated.solModel, size: generated.size, creationType: imageType }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Generated image could not be saved.");
      setGenerated(null);
      setMessage("Saved to the Pathway folder.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generated image could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function setStyleReference(asset: PathwayAsset) {
    setBusy(`style:${asset.id}`);
    try {
      const response = await fetch("/api/admin/pathway-assets/style-reference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetId: asset.id, enabled: true })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Style reference could not be saved.");
      setMessage(`${asset.title} is now part of the remembered Apostolic Guide visual reference set.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Style reference could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function queueInCalendar(asset: PathwayAsset) {
    const contentType = calendarType(asset);
    if (!contentType) return;
    setBusy(`calendar:${asset.id}`);
    try {
      const response = await fetch("/api/admin/content-calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pathwaySlug: asset.pathway_slug,
          title: asset.title,
          contentType,
          platform: asset.studio === "video" ? "youtube" : "instagram",
          status: "draft",
          source: "pathway-assets",
          sourceRef: asset.id,
          assetId: asset.id,
          metadata: { studio: asset.studio, assetType: asset.asset_type, version: asset.version }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not add this asset to the calendar.");
      setMessage(`${asset.title} is in the Content Calendar as a draft. Pick its day there when you are ready.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add this asset to the calendar.");
    } finally {
      setBusy(null);
    }
  }

  async function loadAssetFile(asset: PathwayAsset) {
    const response = await fetch(`/api/admin/pathway-assets/download?id=${encodeURIComponent(asset.id)}`, { cache: "no-store" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Asset download failed.");
    }
    const blob = await response.blob();
    const filename = filenameFromDisposition(response.headers.get("content-disposition"), `${asset.title.replace(/\s+/g, "-")}.bin`);
    return { blob, filename };
  }

  async function downloadAsset(asset: PathwayAsset) {
    setBusy(`download:${asset.id}`);
    try {
      const { blob, filename } = await loadAssetFile(asset);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setMessage(`${asset.title} downloaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Asset download failed.");
    } finally {
      setBusy(null);
    }
  }

  async function shareAsset(asset: PathwayAsset) {
    setBusy(`share:${asset.id}`);
    try {
      const { blob, filename } = await loadAssetFile(asset);
      const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
      if (navigator.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await navigator.share({ title: asset.title, files: [file] });
        setMessage(`${asset.title} opened in the device share sheet.`);
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        setMessage("Device sharing is unavailable here, so the asset was downloaded instead.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setMessage("Share cancelled.");
      else setMessage(error instanceof Error ? error.message : "Asset could not be shared.");
    } finally {
      setBusy(null);
    }
  }

  return <section className="admin-card pathway-asset-library">
    <div className="pathway-assets-head">
      <div className="pathway-folder-title"><FolderOpen size={22}/><div><span className="section-kicker">Pathway parent folder</span><h2>{pathwayTitle}</h2><p>/{pathwaySlug}/ · {assets.length} assets · {parentCount} top-level projects</p></div></div>
      <div className="pathway-assets-actions">
        <input ref={uploadRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadManual(file); }}/>
        <button type="button" className="button" disabled={Boolean(busy)} onClick={() => uploadRef.current?.click()}><Upload size={15}/> Upload to {studio === "carousel" ? "Carousel" : "Video"}</button>
        <button type="button" className="button" disabled={busy === "load"} onClick={() => void refresh()}>{busy === "load" ? <Loader2 size={15} className="spin"/> : <RefreshCw size={15}/>} Refresh</button>
      </div>
    </div>

    <div className="pathway-folder-lanes" aria-label="Pathway asset lanes">
      <button type="button" className={studioScope === "all" ? "is-active" : ""} onClick={() => setStudioScope("all")}><strong>All Pathway</strong><span>{assets.length}</span></button>
      <button type="button" className={studioScope === "carousel" ? "is-active" : ""} onClick={() => setStudioScope("carousel")}><strong>Carousel + Social</strong><span>{carouselCount}</span></button>
      <button type="button" className={studioScope === "video" ? "is-active" : ""} onClick={() => setStudioScope("video")}><strong>Video</strong><span>{videoCount}</span></button>
    </div>

    {message ? <div className="pathway-assets-message">{message}</div> : null}

    <div className="pathway-image-workbench">
      <div><span className="section-kicker">Sol image desk</span><h3>Create a reusable visual</h3><p>Sol directs the image from the saved brand profile and images you marked as style references. Text stays outside the generated image so the graphic layer can be reused and the layout stays editable.</p></div>
      <div className="pathway-image-controls">
        <select value={imageType} onChange={(event) => setImageType(event.target.value as typeof imageType)}>
          {studio === "carousel" ? <><option value="single-post">Single post visual</option><option value="story">Story visual</option><option value="thumbnail">Thumbnail</option><option value="background">Carousel background</option></> : <><option value="thumbnail">Video thumbnail</option><option value="background">Video visual</option></>}
        </select>
        <textarea rows={3} value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} placeholder="Example: A restrained documentary image suggesting revelation and identity, strong negative space for type…"/>
        <button type="button" className="button primary" disabled={!aiReady || Boolean(busy) || imagePrompt.trim().length < 3} onClick={() => void generateImage()}>{busy === "generate" ? <Loader2 className="spin" size={15}/> : <Sparkles size={15}/>} Generate with Sol</button>
      </div>
      {generated ? <div className="pathway-generated-preview"><img src={generated.dataUrl} alt="Generated Apostolic Guide visual preview"/><div><strong>Generated visual</strong><span>{generated.imageModel}</span><button type="button" className="button primary" disabled={Boolean(busy)} onClick={() => void saveGenerated()}>{busy === "save-image" ? <Loader2 className="spin" size={15}/> : <FolderOpen size={15}/>} Save to Pathway</button></div></div> : null}
    </div>

    <div className="pathway-assets-filter">
      {(["all","visual","copy","output"] as const).map((key) => <button type="button" key={key} className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)}>{key === "all" ? "All assets" : key === "visual" ? "Visuals" : key === "copy" ? "Copy" : "Projects + outputs"}</button>)}
    </div>

    {visible.length ? <div className="pathway-assets-grid">{visible.map((asset) => {
      const canCalendar = !asset.parent_asset_id && Boolean(calendarType(asset));
      return <article className="pathway-asset-card" key={asset.id}>
        {asset.preview_url ? <button type="button" className="pathway-asset-preview" onClick={() => onOpenAsset?.(asset)}><img src={asset.preview_url} alt=""/></button> : <div className="pathway-asset-preview is-empty"><ImageIcon size={22}/></div>}
        <div className="pathway-asset-copy"><span>{asset.studio} · {asset.asset_type.replaceAll("-", " ")} · v{asset.version}</span><strong>{asset.title}</strong><small>{asset.status} · {asset.source_type} · {new Date(asset.updated_at).toLocaleString()}</small></div>
        <div className="pathway-asset-actions">
          {asset.editable && onOpenAsset ? <button type="button" onClick={() => onOpenAsset(asset)}><Pencil size={14}/> Edit</button> : null}
          {canCalendar ? <button type="button" disabled={Boolean(busy)} onClick={() => void queueInCalendar(asset)}>{busy === `calendar:${asset.id}` ? <Loader2 className="spin" size={14}/> : <CalendarPlus size={14}/>} Calendar</button> : null}
          {(asset.storage_path || asset.public_url) ? <button type="button" disabled={Boolean(busy)} onClick={() => void downloadAsset(asset)}>{busy === `download:${asset.id}` ? <Loader2 className="spin" size={14}/> : <Download size={14}/>} Download</button> : null}
          {(asset.storage_path || asset.public_url) ? <button type="button" disabled={Boolean(busy)} onClick={() => void shareAsset(asset)}>{busy === `share:${asset.id}` ? <Loader2 className="spin" size={14}/> : <Share2 size={14}/>} Share</button> : null}
          {asset.preview_url ? <button type="button" disabled={busy === `style:${asset.id}`} onClick={() => void setStyleReference(asset)}>{busy === `style:${asset.id}` ? <Loader2 className="spin" size={14}/> : <Star size={14}/>} Remember style</button> : null}
        </div>
      </article>;
    })}</div> : <div className="studio-empty-state compact"><FolderOpen size={26}/><strong>No assets in this lane yet</strong><p>Generate, save, or upload the first asset. Every future output will stay attached to this Pathway.</p></div>}
  </section>;
}

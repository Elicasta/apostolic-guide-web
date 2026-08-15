"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Image as ImageIcon, Loader2, Pencil, RefreshCw, Sparkles, Star, Upload } from "lucide-react";

type Studio = "carousel" | "video";
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
  const [filter, setFilter] = useState<"all" | "visual" | "copy" | "output">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageType, setImageType] = useState<"single-post" | "story" | "thumbnail" | "background">(studio === "video" ? "thumbnail" : "single-post");
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const visible = useMemo(() => filter === "all" ? assets : assets.filter((asset) => assetGroup(asset.asset_type) === filter), [assets, filter]);
  const parentCount = assets.filter((asset) => !asset.parent_asset_id).length;

  async function refresh() {
    if (!pathwaySlug) return;
    setBusy("load");
    try {
      const response = await fetch(`/api/admin/pathway-assets?pathwaySlug=${encodeURIComponent(pathwaySlug)}&studio=${studio}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Assets could not be loaded.");
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Assets could not be loaded.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => { void refresh(); }, [pathwaySlug, studio]); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadManual(file: File) {
    setBusy("upload");
    setMessage("Uploading to this Pathway folder…");
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
      const orientation = imageType === "thumbnail" ? "landscape" : imageType === "story" ? "portrait" : "portrait";
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

  return <section className="admin-card pathway-asset-library">
    <div className="pathway-assets-head">
      <div className="pathway-folder-title"><FolderOpen size={22}/><div><span className="section-kicker">Pathway parent folder</span><h2>{pathwayTitle}</h2><p>/{pathwaySlug}/{studio}/ · {assets.length} assets · {parentCount} top-level projects</p></div></div>
      <div className="pathway-assets-actions">
        <input ref={uploadRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadManual(file); }}/>
        <button type="button" className="button" disabled={Boolean(busy)} onClick={() => uploadRef.current?.click()}><Upload size={15}/> Upload asset</button>
        <button type="button" className="button" disabled={busy === "load"} onClick={() => void refresh()}>{busy === "load" ? <Loader2 size={15} className="spin"/> : <RefreshCw size={15}/>} Refresh</button>
      </div>
    </div>

    {message ? <div className="pathway-assets-message">{message}</div> : null}

    <div className="pathway-image-workbench">
      <div><span className="section-kicker">Sol image desk</span><h3>Create a reusable visual</h3><p>Sol directs the image from the saved brand profile and any images you marked as style references. Text stays outside the generated image so the graphic remains editable.</p></div>
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

    {visible.length ? <div className="pathway-assets-grid">{visible.map((asset) => <article className="pathway-asset-card" key={asset.id}>
      {asset.preview_url ? <button type="button" className="pathway-asset-preview" onClick={() => onOpenAsset?.(asset)}><img src={asset.preview_url} alt=""/></button> : <div className="pathway-asset-preview is-empty"><ImageIcon size={22}/></div>}
      <div className="pathway-asset-copy"><span>{asset.asset_type.replaceAll("-", " ")} · v{asset.version}</span><strong>{asset.title}</strong><small>{asset.source_type} · {new Date(asset.updated_at).toLocaleString()}</small></div>
      <div className="pathway-asset-actions">
        {asset.editable && onOpenAsset ? <button type="button" onClick={() => onOpenAsset(asset)}><Pencil size={14}/> Edit</button> : null}
        {asset.preview_url ? <button type="button" disabled={busy === `style:${asset.id}`} onClick={() => void setStyleReference(asset)}>{busy === `style:${asset.id}` ? <Loader2 className="spin" size={14}/> : <Star size={14}/>} Remember style</button> : null}
      </div>
    </article>)}</div> : <div className="studio-empty-state compact"><FolderOpen size={26}/><strong>This Pathway folder is empty</strong><p>Generate, save, or upload the first asset. Future outputs will stay attached to this Pathway.</p></div>}
  </section>;
}

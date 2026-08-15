"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Save } from "lucide-react";

type Asset = {
  id: string;
  pathway_slug: string;
  studio: "carousel" | "video";
  asset_type: string;
  parent_asset_id: string | null;
  title: string;
  status: "draft" | "review" | "approved" | "ready" | "published" | "archived";
  source_type: "manual" | "sol" | "generated" | "uploaded" | "rendered" | "imported";
  editable: boolean;
  version: number;
  content: Record<string, unknown>;
  storage_bucket: string | null;
  storage_path: string | null;
  public_url: string | null;
  prompt: string | null;
  model: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
};

type Version = { version: number; created_at: string };
type Slide = { kind?: string; eyebrow?: string; title?: string; body?: string; reference?: string; secondaryReference?: string };

function isSlides(value: unknown): value is Slide[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object");
}

export function PathwayAssetEditor({ initialAsset, versions }: { initialAsset: Asset; versions: Version[] }) {
  const [asset, setAsset] = useState(initialAsset);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [rawContent, setRawContent] = useState(JSON.stringify(initialAsset.content ?? {}, null, 2));
  const slides = useMemo(() => isSlides(asset.content?.slides) ? asset.content.slides : null, [asset.content]);
  const caption = asset.asset_type === "caption" ? asset.content : null;

  function updateSlide(index: number, patch: Partial<Slide>) {
    if (!slides) return;
    const next = slides.map((slide, slideIndex) => slideIndex === index ? { ...slide, ...patch } : slide);
    const content = { ...asset.content, slides: next };
    setAsset((current) => ({ ...current, content }));
    setRawContent(JSON.stringify(content, null, 2));
  }

  function updateCaption(key: string, value: string) {
    const content = { ...asset.content, [key]: value };
    setAsset((current) => ({ ...current, content }));
    setRawContent(JSON.stringify(content, null, 2));
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      let content = asset.content;
      if (!slides && !caption) {
        try { content = JSON.parse(rawContent) as Record<string, unknown>; }
        catch { throw new Error("Source data is not valid JSON."); }
      }
      const response = await fetch("/api/admin/pathway-assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: asset.id,
          pathwaySlug: asset.pathway_slug,
          studio: asset.studio,
          assetType: asset.asset_type,
          parentAssetId: asset.parent_asset_id,
          title: asset.title,
          status: asset.status,
          sourceType: asset.source_type,
          editable: asset.editable,
          content,
          storageBucket: asset.storage_bucket,
          storagePath: asset.storage_path,
          publicUrl: asset.public_url,
          prompt: asset.prompt,
          model: asset.model,
          metadata: asset.metadata
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Asset could not be saved.");
      setAsset(data.asset as Asset);
      setRawContent(JSON.stringify(data.asset.content ?? {}, null, 2));
      setMessage(`Saved as version ${data.asset.version}. Version ${asset.version} remains in history.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Asset could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="pathway-asset-editor-page">
    <div className="studio-page-heading pathway-asset-editor-heading">
      <div><span className="eyebrow">{asset.studio === "carousel" ? "Carousel Studio" : "Video Studio"} · Pathway asset</span><h1>{asset.title}</h1><p className="admin-lede">Reopen the structured source, make corrections, and save a new version without destroying the previous one.</p></div>
      <div className="pathway-asset-editor-actions"><Link className="button" href={asset.studio === "carousel" ? "/admin/carousel-studio" : "/admin/video-studio"}><ArrowLeft size={15}/> Back to Studio</Link><button type="button" className="button primary" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="spin" size={15}/> : <Save size={15}/>} Save new version</button></div>
    </div>

    {message ? <div className="admin-notice"><CheckCircle2 size={15}/>{message}</div> : null}

    <div className="pathway-asset-editor-grid">
      <section className="admin-card pathway-asset-source-editor">
        <div className="carousel-card-heading"><div><span className="section-kicker">Editable source</span><h2>{asset.asset_type.replaceAll("-", " ")}</h2></div><span>v{asset.version}</span></div>
        <div className="pathway-asset-editor-meta"><label><span>Title</span><input value={asset.title} onChange={(event) => setAsset((current) => ({ ...current, title: event.target.value }))}/></label><label><span>Status</span><select value={asset.status} onChange={(event) => setAsset((current) => ({ ...current, status: event.target.value as Asset["status"] }))}><option value="draft">Draft</option><option value="review">Review</option><option value="approved">Approved</option><option value="ready">Ready</option><option value="published">Published</option><option value="archived">Archived</option></select></label></div>

        {slides ? <div className="pathway-asset-slide-editor">{slides.map((slide, index) => <article key={index}><div><strong>{String(index + 1).padStart(2,"0")}</strong><span>{slide.kind || "frame"}</span></div><label><span>Eyebrow</span><input value={slide.eyebrow || ""} onChange={(event) => updateSlide(index, { eyebrow: event.target.value })}/></label><label><span>Headline</span><textarea rows={2} value={slide.title || ""} onChange={(event) => updateSlide(index, { title: event.target.value })}/></label><label><span>Body</span><textarea rows={4} value={slide.body || ""} onChange={(event) => updateSlide(index, { body: event.target.value })}/></label><div className="pathway-asset-editor-meta"><label><span>Reference</span><input value={slide.reference || ""} onChange={(event) => updateSlide(index, { reference: event.target.value })}/></label><label><span>Second reference</span><input value={slide.secondaryReference || ""} onChange={(event) => updateSlide(index, { secondaryReference: event.target.value })}/></label></div></article>)}</div> : null}

        {caption ? <div className="pathway-asset-caption-editor">{["caption","shortCaption","storyCopy","altText","hook","cta"].map((key) => <label key={key}><span>{key.replace(/([A-Z])/g," $1")}</span><textarea rows={key === "caption" ? 9 : 4} value={typeof caption[key] === "string" ? String(caption[key]) : ""} onChange={(event) => updateCaption(key, event.target.value)}/></label>)}</div> : null}

        {!slides && !caption ? <label className="pathway-asset-json-editor"><span>Structured source data</span><textarea rows={20} value={rawContent} onChange={(event) => setRawContent(event.target.value)} spellCheck={false}/><small>Advanced editor. Saving creates a new version snapshot first.</small></label> : null}
      </section>

      <aside className="admin-card pathway-asset-version-card"><span className="section-kicker">Version history</span><h2>Asset history</h2><p>Current: version {asset.version}</p><div>{versions.length ? versions.map((version) => <article key={`${version.version}-${version.created_at}`}><strong>v{version.version}</strong><span>{new Date(version.created_at).toLocaleString()}</span></article>) : <small>No previous versions yet. The first edit will create version 1 here.</small>}</div>{asset.prompt ? <><span className="section-kicker pathway-asset-prompt-kicker">Generation prompt</span><p className="pathway-asset-prompt">{asset.prompt}</p></> : null}</aside>
    </div>
  </div>;
}

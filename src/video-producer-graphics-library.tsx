"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Image as ImageIcon, Layers3, Loader2, Plus, RefreshCw, Search, Upload as UploadIcon } from "lucide-react";
import styles from "./video-producer-library.module.css";
import {
  VIDEO_PRODUCER_GRAPHIC_ALIGNMENTS,
  VIDEO_PRODUCER_GRAPHIC_ASSET_TYPES,
  VIDEO_PRODUCER_GRAPHIC_DISPLAY_BEHAVIORS,
  VIDEO_PRODUCER_GRAPHIC_REFERENCE_ZONES,
  VIDEO_PRODUCER_GRAPHIC_TEXT_BEHAVIORS,
  type VideoProducerGraphicAlignment,
  type VideoProducerGraphicDisplayBehavior,
  type VideoProducerGraphicFormat,
  type VideoProducerGraphicReferenceZone,
  type VideoProducerGraphicTextBehavior
} from "./video-producer-graphic-assets";
import { VideoProducerSectionNav } from "./video-producer-section-nav";

type GraphicAsset = {
  id: string;
  title: string;
  kind: string;
  formats: VideoProducerGraphicFormat[];
  textBehavior: VideoProducerGraphicTextBehavior;
  maxLines: number | null;
  alignment: VideoProducerGraphicAlignment;
  referenceZone: VideoProducerGraphicReferenceZone;
  displayBehavior: VideoProducerGraphicDisplayBehavior;
  fixedText?: string | null;
  storageProvider: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  tags: string[];
  notes?: string | null;
  previewUrl: string;
  updatedAt: string;
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-140) || "graphic.png";
}
function titleFromFile(value: string) {
  return value.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 160) || "Untitled graphic";
}
function labelForKind(kind: string) {
  return VIDEO_PRODUCER_GRAPHIC_ASSET_TYPES.find((option) => option.value === kind)?.label ?? kind;
}
function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function VideoProducerGraphicsLibrary() {
  const [assets, setAssets] = useState<GraphicAsset[]>([]);
  const [view, setView] = useState<"library" | "create">("library");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("scripture-frame");
  const [outputFormat, setOutputFormat] = useState<"both" | VideoProducerGraphicFormat>("both");
  const [textBehavior, setTextBehavior] = useState<VideoProducerGraphicTextBehavior>("editable");
  const [maxLines, setMaxLines] = useState(4);
  const [alignment, setAlignment] = useState<VideoProducerGraphicAlignment>("center");
  const [referenceZone, setReferenceZone] = useState<VideoProducerGraphicReferenceZone>("safe-center");
  const [displayBehavior, setDisplayBehavior] = useState<VideoProducerGraphicDisplayBehavior>("full-screen");
  const [fixedText, setFixedText] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/video-producer/graphics", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Graphics Library could not be loaded.");
      setAssets(data.assets ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Graphics Library could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
      if (!needle) return true;
      return [asset.title, asset.filename, asset.kind, asset.textBehavior, asset.alignment, asset.referenceZone, asset.displayBehavior, asset.fixedText || "", asset.notes || "", ...asset.formats, ...asset.tags].join(" ").toLowerCase().includes(needle);
    });
  }, [assets, kindFilter, query]);

  async function addAsset() {
    if (!file || busy) return;
    const mime = file.type || (file.name.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png");
    if (!["image/png", "image/webp"].includes(mime)) { setError("Upload a PNG or WebP graphic."); return; }
    const assetId = crypto.randomUUID();
    const assetTitle = title.trim() || titleFromFile(file.name);
    const tagList = tags.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
    const formats: VideoProducerGraphicFormat[] = outputFormat === "both" ? ["podcast", "reels"] : [outputFormat];
    if (textBehavior === "fixed" && !fixedText.trim()) { setError("Enter the exact text baked into this artwork."); return; }
    setBusy(true); setProgress(0); setError(""); setMessage("Uploading private graphic…");
    try {
      await upload(`video-producer/graphics/${assetId}/${safeName(file.name)}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/video-producer/graphics/upload",
        multipart: false,
        contentType: mime,
        clientPayload: JSON.stringify({
          assetId,
          title: assetTitle,
          assetType: kind,
          formats,
          textBehavior,
          maxLines: textBehavior === "none" ? null : maxLines,
          alignment,
          referenceZone,
          displayBehavior,
          fixedText: textBehavior === "fixed" ? fixedText.trim() : null,
          tags: tagList,
          notes: notes.trim(),
          filename: file.name,
          contentType: mime,
          size: file.size
        }),
        onUploadProgress(event) { setProgress(Math.round(event.percentage)); }
      });
      setProgress(100); setMessage("Graphic added to the reusable library.");
      setTitle(""); setKind("scripture-frame"); setOutputFormat("both"); setTextBehavior("editable"); setMaxLines(4); setAlignment("center"); setReferenceZone("safe-center"); setDisplayBehavior("full-screen"); setFixedText(""); setTags(""); setNotes(""); setFile(null);
      await load();
      setView("library");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Graphic could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}><div className={styles.eyebrow}>Apostolic Guide Media</div><h1>Graphics</h1><p>Reusable visual ingredients for Video Producer. Create one asset or browse the library, not both at once.</p></div>
          <button type="button" className={styles.iconButton} onClick={() => void load()} disabled={loading} aria-label="Refresh graphics">{loading ? <Loader2 size={18} className={styles.spin}/> : <RefreshCw size={18}/>}</button>
        </header>

        <VideoProducerSectionNav active="graphics"/>

        <div className={styles.modeSwitch} aria-label="Graphics view">
          <button type="button" data-active={view === "library"} onClick={() => setView("library")}>Library · {assets.length}</button>
          <button type="button" data-active={view === "create"} onClick={() => setView("create")}><Plus size={12}/> Add graphic</button>
        </div>

        {error ? <div className={styles.error} style={{ marginBottom: 12 }}>{error}</div> : null}

        {view === "create" ? (
          <section className={styles.formCard}>
            <div className={styles.formHead}>
              <div><div className={styles.eyebrow}>Reusable asset</div><h2>Add a designed graphic</h2><p>Upload a finished PNG or WebP. Keep changing episode text outside the image when possible.</p></div>
              <span className={styles.statusPill}><Layers3 size={11}/> Private</span>
            </div>

            <div className={styles.fields}>
              <div className={styles.field}><label>Asset name</label><input className={styles.input} disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Scripture Lower Third — Navy"/></div>
              <div className={styles.field}><label>Asset type</label><select className={styles.select} disabled={busy} value={kind} onChange={(event) => setKind(event.target.value)}>{VIDEO_PRODUCER_GRAPHIC_ASSET_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            </div>

            <div className={styles.fields}>
              <div className={styles.field}><label>Podcast / Reels format</label><select className={styles.select} disabled={busy} value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as "both" | VideoProducerGraphicFormat)}><option value="both">Podcast + Reels</option><option value="podcast">Podcast only</option><option value="reels">Reels only</option></select></div>
              <div className={styles.field}><label>Display behavior</label><select className={styles.select} disabled={busy} value={displayBehavior} onChange={(event) => setDisplayBehavior(event.target.value as VideoProducerGraphicDisplayBehavior)}>{VIDEO_PRODUCER_GRAPHIC_DISPLAY_BEHAVIORS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            </div>

            <details className={styles.details} open>
              <summary>Text behavior + placement rules</summary>
              <div className={styles.detailsBody}>
                <div className={styles.fields}>
                  <div className={styles.field}><label>Text behavior</label><select className={styles.select} disabled={busy} value={textBehavior} onChange={(event) => setTextBehavior(event.target.value as VideoProducerGraphicTextBehavior)}>{VIDEO_PRODUCER_GRAPHIC_TEXT_BEHAVIORS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                  <div className={styles.field}><label>Max lines</label><input className={styles.input} disabled={busy || textBehavior === "none"} type="number" min={1} max={12} value={maxLines} onChange={(event) => setMaxLines(Math.max(1, Math.min(12, Number(event.target.value) || 1)))}/></div>
                </div>
                <div className={styles.fields}>
                  <div className={styles.field}><label>Alignment</label><select className={styles.select} disabled={busy} value={alignment} onChange={(event) => setAlignment(event.target.value as VideoProducerGraphicAlignment)}>{VIDEO_PRODUCER_GRAPHIC_ALIGNMENTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                  <div className={styles.field}><label>Reference zone</label><select className={styles.select} disabled={busy} value={referenceZone} onChange={(event) => setReferenceZone(event.target.value as VideoProducerGraphicReferenceZone)}>{VIDEO_PRODUCER_GRAPHIC_REFERENCE_ZONES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                </div>
                {textBehavior === "fixed" ? <div className={styles.field}><label>Fixed text</label><input className={styles.input} disabled={busy} value={fixedText} onChange={(event) => setFixedText(event.target.value)} placeholder="Exact wording baked into this artwork"/></div> : null}
              </div>
            </details>

            <details className={styles.details}>
              <summary>Tags + usage / variant notes</summary>
              <div className={styles.detailsBody}>
                <div className={styles.field}><label>Tags</label><input className={styles.input} disabled={busy} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="navy, scripture, full frame"/></div>
                <div className={styles.field}><label>Usage / variant notes</label><input className={styles.input} disabled={busy} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Use for anchor Scriptures; navy variant"/></div>
              </div>
            </details>

            <div className={styles.uploadBox}>
              <input disabled={busy} type="file" accept="image/png,image/webp" onChange={(event) => { const next = event.target.files?.[0] ?? null; setFile(next); if (next && !title.trim()) setTitle(titleFromFile(next.name)); }}/>
              {busy || progress ? <div className={styles.progressBox}><div className={styles.progressLine}><span>{message || "Uploading…"}</span><strong>{progress}%</strong></div><div className={styles.progressTrack}><i style={{ width: `${Math.max(progress, progress ? 3 : 0)}%` }}/></div></div> : null}
            </div>

            <div className={styles.formActions}>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setView("library")}>Cancel</button>
              <button type="button" className={styles.primaryButton} disabled={!file || busy} onClick={() => void addAsset()}>{busy ? <Loader2 size={14} className={styles.spin}/> : <UploadIcon size={14}/>} Add to library</button>
            </div>
          </section>
        ) : (
          <section className={styles.section} style={{ marginTop: 0 }}>
            <div className={styles.libraryToolbar}>
              <label className={styles.search}><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search graphics…"/></label>
              <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} aria-label="Filter graphics by type"><option value="all">All types</option>{VIDEO_PRODUCER_GRAPHIC_ASSET_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            </div>
            <div className={styles.sectionHead}><div className={styles.sectionTitle}><h2>Approved visual ingredients</h2><span className={styles.count}>{visible.length}</span></div></div>
            {loading && !assets.length ? <div className={styles.empty}>Loading graphics…</div> : visible.length ? (
              <div className={styles.assetGrid}>{visible.map((asset) => (
                <article className={styles.assetCard} key={asset.id}>
                  <div className={styles.assetPreview}><img src={asset.previewUrl} alt={asset.title}/></div>
                  <div className={styles.assetMeta}><small>{labelForKind(asset.kind)} · {asset.formats.map((format) => format === "podcast" ? "Podcast" : "Reels").join(" + ")} · {formatSize(asset.sizeBytes)}</small><strong>{asset.title}</strong><span>{asset.displayBehavior} · {asset.referenceZone} · {asset.textBehavior}{asset.maxLines ? ` · ${asset.maxLines} lines max` : ""}</span>{asset.fixedText ? <p>Fixed: “{asset.fixedText}”</p> : null}{asset.tags.length ? <span>{asset.tags.join(" · ")}</span> : null}{asset.notes ? <p>{asset.notes}</p> : null}</div>
                </article>
              ))}</div>
            ) : <div className={styles.empty}><ImageIcon size={18}/> {assets.length ? "No graphics match this search." : "No designed graphics yet. Add the first PNG or WebP."}</div>}
          </section>
        )}
      </div>
    </main>
  );
}

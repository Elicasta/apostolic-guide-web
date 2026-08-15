"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ArrowLeft, Image as ImageIcon, Layers3, Loader2, RefreshCw, Upload as UploadIcon } from "lucide-react";
import Link from "next/link";
import styles from "./video-producer-sequential.module.css";

const KINDS = [
  ["scripture-frame", "Scripture frame"],
  ["pathway-frame", "Pathway stop"],
  ["lower-third", "Lower third"],
  ["statement", "Statement card"],
  ["cta", "CTA"],
  ["overlay", "Overlay"],
  ["texture", "Texture"],
  ["logo", "Logo / mark"],
  ["other", "Other"]
] as const;

type GraphicAsset = {
  id: string;
  title: string;
  kind: string;
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
  return KINDS.find(([value]) => value === kind)?.[1] ?? kind;
}
function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function VideoProducerGraphicsLibrary() {
  const [assets, setAssets] = useState<GraphicAsset[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("scripture-frame");
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

  const groups = useMemo(() => {
    const result = new Map<string, GraphicAsset[]>();
    for (const asset of assets) result.set(asset.kind, [...(result.get(asset.kind) ?? []), asset]);
    return result;
  }, [assets]);

  async function addAsset() {
    if (!file || busy) return;
    const mime = file.type || (file.name.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png");
    if (!["image/png", "image/webp"].includes(mime)) { setError("Upload a PNG or WebP graphic."); return; }
    const assetId = crypto.randomUUID();
    const assetTitle = title.trim() || titleFromFile(file.name);
    const tagList = tags.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
    setBusy(true); setProgress(0); setError(""); setMessage("Uploading private graphic…");
    try {
      await upload(`video-producer/graphics/${assetId}/${safeName(file.name)}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/video-producer/graphics/upload",
        multipart: false,
        contentType: mime,
        clientPayload: JSON.stringify({ assetId, title: assetTitle, kind, tags: tagList, notes: notes.trim(), filename: file.name, contentType: mime, size: file.size }),
        onUploadProgress(event) { setProgress(Math.round(event.percentage)); }
      });
      setProgress(100); setMessage("Graphic added to the reusable library.");
      setTitle(""); setTags(""); setNotes(""); setFile(null);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Graphic could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.dashboard}>
      <div className={styles.dashboardShell}>
        <div className={styles.flowTopline}><Link className={styles.backLink} href="/admin/video-producer"><ArrowLeft size={14}/> Video Producer</Link></div>
        <header className={styles.dashboardHeader}>
          <div><div className={styles.eyebrow}>Apostolic Guide Media</div><h1>Graphics Library</h1><p>Upload real designed PNG/WebP assets once. These become the approved visual ingredients for Scripture frames, Pathway stops, lower thirds, textures and overlays.</p></div>
          <button type="button" className={styles.iconAction} onClick={() => void load()} disabled={loading} aria-label="Refresh graphics">{loading ? <Loader2 size={18} className={styles.spin}/> : <RefreshCw size={18}/>}</button>
        </header>

        <section className={styles.workspace}>
          <header className={styles.workspaceHeader}><div className={styles.workspaceHeaderRow}><div><div className={styles.eyebrow}>Reusable asset</div><h2>Add a designed graphic</h2><p>Transparent PNGs are ideal. WebP is also supported. Keep text that changes per episode out of the image when possible so the renderer can place live Scripture, titles and pathway copy over your design.</p></div><span className={styles.statusPill}><Layers3 size={12}/> Private</span></div></header>
          <div className={styles.workspaceBody}><div className={styles.stack}>
            {error ? <div className={`${styles.notice} ${styles.warning}`}>{error}</div> : null}
            <div className={styles.fields}>
              <div className={styles.field}><label>Asset name</label><input className={styles.input} disabled={busy} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Scripture Lower Third — Navy"/></div>
              <div className={styles.field}><label>Type</label><select className={styles.select} disabled={busy} value={kind} onChange={(event) => setKind(event.target.value)}>{KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            </div>
            <div className={styles.fields}>
              <div className={styles.field}><label>Tags</label><input className={styles.input} disabled={busy} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="navy, scripture, full frame"/></div>
              <div className={styles.field}><label>Notes</label><input className={styles.input} disabled={busy} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Use for anchor Scriptures"/></div>
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}><UploadIcon size={17}/> PNG / WebP</h3><p className={styles.panelText}>Up to 25 MB. Assets stay in private media storage and are served with short-lived signed previews.</p>
              <input className={styles.fileInput} disabled={busy} type="file" accept="image/png,image/webp" onChange={(event) => { const next = event.target.files?.[0] ?? null; setFile(next); if (next && !title.trim()) setTitle(titleFromFile(next.name)); }}/>
              {busy || progress ? <div className={styles.progressBox}><div className={styles.progressLine}><span>{message || "Uploading…"}</span><strong>{progress}%</strong></div><div className={styles.progressTrack}><i style={{ width: `${Math.max(progress, progress ? 3 : 0)}%` }}/></div></div> : null}
              <div className={styles.actions}><button type="button" className={styles.button} disabled={!file || busy} onClick={() => void addAsset()}>{busy ? <Loader2 size={14} className={styles.spin}/> : <UploadIcon size={14}/>} Add to library</button></div>
            </div>
          </div></div>
        </section>

        <section className={styles.projectSection}>
          <div className={styles.sectionHeading}><h2>Approved visual ingredients</h2><span>{assets.length}</span></div>
          {loading && !assets.length ? <div className={styles.empty}>Loading graphics…</div> : assets.length ? (
            <div className={styles.graphicLibraryGrid}>{Array.from(groups.entries()).flatMap(([groupKind, items]) => items.map((asset) => (
              <article className={styles.graphicAsset} key={asset.id}>
                <div className={styles.graphicPreview}><img src={asset.previewUrl} alt={asset.title}/></div>
                <div className={styles.graphicMeta}><small>{labelForKind(groupKind)} · {formatSize(asset.sizeBytes)}</small><strong>{asset.title}</strong>{asset.tags.length ? <span>{asset.tags.join(" · ")}</span> : null}{asset.notes ? <p>{asset.notes}</p> : null}</div>
              </article>
            )))}</div>
          ) : <div className={styles.empty}><ImageIcon size={18}/> No designed graphics yet. Upload the first PNG or WebP above.</div>}
        </section>
      </div>
    </main>
  );
}

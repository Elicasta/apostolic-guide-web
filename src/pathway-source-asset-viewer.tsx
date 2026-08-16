"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarPlus,
  Download,
  FileArchive,
  FileAudio,
  FileText,
  Film,
  Image as ImageIcon,
  Layers3,
  ShieldCheck
} from "lucide-react";
import { humanPathwayAssetBytes, humanPathwayAssetDuration, pathwayAssetMediaKind } from "@/pathway-asset-ingest";

type SourceAsset = {
  id: string;
  pathway_slug: string;
  studio: "carousel" | "video";
  asset_type: string;
  title: string;
  status: string;
  source_type: string;
  version: number;
  storage_bucket: string | null;
  storage_path: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
};

function sourceIcon(kind: string | null) {
  if (kind === "video") return <Film size={22}/>;
  if (kind === "audio") return <FileAudio size={22}/>;
  if (kind === "document") return <FileText size={22}/>;
  if (kind === "archive") return <FileArchive size={22}/>;
  return <ImageIcon size={22}/>;
}

export function PathwaySourceAssetViewer({ asset, signedUrl }: { asset: SourceAsset; signedUrl: string | null }) {
  const mime = typeof asset.metadata.mimeType === "string" ? asset.metadata.mimeType : typeof asset.metadata.mime === "string" ? asset.metadata.mime : "";
  const kind = pathwayAssetMediaKind(mime);
  const bytes = Number(asset.metadata.bytes || 0);
  const duration = Number(asset.metadata.duration || 0);
  const width = Number(asset.metadata.width || 0);
  const height = Number(asset.metadata.height || 0);
  const originalFileName = typeof asset.metadata.originalFileName === "string" ? asset.metadata.originalFileName : asset.storage_path?.split("/").pop() || asset.title;
  const sha = typeof asset.metadata.sha256 === "string" ? asset.metadata.sha256 : "";
  const ingestSession = typeof asset.metadata.ingestSessionId === "string" ? asset.metadata.ingestSessionId : "";

  return <main className="admin-page pathway-source-viewer">
    <div className="pathway-source-topbar">
      <Link href="/admin/assets" className="button"><ArrowLeft size={15}/> Pathway Assets</Link>
      <span><ShieldCheck size={14}/> Private source master · original preserved</span>
    </div>

    <header className="pathway-source-header">
      <div className="pathway-source-kind">{sourceIcon(kind)}</div>
      <div>
        <span className="section-kicker">Source master</span>
        <h1>{asset.title}</h1>
        <p>{asset.pathway_slug.replaceAll("-", " ")} · {asset.studio === "video" ? "Video Production" : "Carousel + Social"} · {asset.asset_type.replaceAll("-", " ")} · v{asset.version}</p>
      </div>
      <div className="pathway-source-status"><span>{asset.status}</span><small>{asset.source_type}</small></div>
    </header>

    <section className="pathway-source-stage">
      {kind === "video" && signedUrl ? <video src={signedUrl} controls playsInline preload="metadata"/> : null}
      {kind === "audio" && signedUrl ? <div className="pathway-source-audio"><FileAudio size={42}/><strong>{originalFileName}</strong><audio src={signedUrl} controls preload="metadata"/></div> : null}
      {kind === "image" && signedUrl ? <img src={signedUrl} alt={typeof asset.metadata.altText === "string" ? asset.metadata.altText : asset.title}/> : null}
      {kind === "document" && signedUrl ? <iframe src={signedUrl} title={asset.title}/> : null}
      {kind === "archive" || !signedUrl ? <div className="pathway-source-no-preview">{sourceIcon(kind)}<strong>{kind === "archive" ? "Project archive" : "Preview unavailable"}</strong><p>The original master is preserved in private Storage. Download it when you need the source file.</p></div> : null}
    </section>

    <section className="pathway-source-grid">
      <article className="admin-card pathway-source-facts">
        <span className="section-kicker">Master facts</span>
        <div><span>Original file</span><strong>{originalFileName}</strong></div>
        <div><span>Format</span><strong>{mime || "Unknown"}</strong></div>
        <div><span>Size</span><strong>{humanPathwayAssetBytes(bytes)}</strong></div>
        {duration > 0 ? <div><span>Duration</span><strong>{humanPathwayAssetDuration(duration)}</strong></div> : null}
        {width > 0 && height > 0 ? <div><span>Dimensions</span><strong>{width} × {height}</strong></div> : null}
        <div><span>Updated</span><strong>{new Date(asset.updated_at).toLocaleString()}</strong></div>
      </article>

      <article className="admin-card pathway-source-provenance">
        <span className="section-kicker">Provenance</span>
        <p>This is the untouched source-master record. Production outputs should derive from it instead of replacing it.</p>
        <div>{sha ? <code>SHA-256 {sha}</code> : <code>Large-file fingerprint tracked by ingest session</code>}{ingestSession ? <code>Ingest {ingestSession}</code> : null}{asset.storage_bucket ? <code>{asset.storage_bucket}</code> : null}</div>
      </article>
    </section>

    <section className="admin-card pathway-source-actions">
      <div><span className="section-kicker">Send it forward</span><h2>Production handoff</h2><p>The source stays fixed while the production lane creates the working project, render, thumbnail, carousel, or distribution asset around it.</p></div>
      <div>
        <a className="button primary" href={`/api/admin/pathway-assets/download?id=${encodeURIComponent(asset.id)}`}><Download size={15}/> Download original</a>
        <Link className="button" href={asset.studio === "video" ? "/admin/video-studio" : "/admin/carousel-studio"}>{asset.studio === "video" ? <Film size={15}/> : <Layers3 size={15}/>} Open {asset.studio === "video" ? "Video Studio" : "Carousel Studio"}</Link>
        <Link className="button" href="/admin/content-calendar"><CalendarPlus size={15}/> Content Calendar</Link>
      </div>
    </section>
  </main>;
}

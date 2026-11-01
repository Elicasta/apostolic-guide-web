"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Film, FolderOpen, Layers3, Pencil, Search } from "lucide-react";

type Asset = {
  id: string;
  pathway_slug: string;
  studio: "carousel" | "video";
  asset_type: string;
  parent_asset_id: string | null;
  title: string;
  status: string;
  source_type: string;
  editable: boolean;
  version: number;
  storage_path: string | null;
  public_url: string | null;
  updated_at: string;
};
type Pathway = { slug: string; title: string; collection: string };

export function PathwayAssetIndex({ assets, pathways }: { assets: Asset[]; pathways: Pathway[] }) {
  const [query, setQuery] = useState("");
  const [studio, setStudio] = useState<"all"|"carousel"|"video">("all");
  const pathwayMap = useMemo(() => new Map(pathways.map((item) => [item.slug, item])), [pathways]);
  const visible = useMemo(() => assets.filter((asset) => {
    if (studio !== "all" && asset.studio !== studio) return false;
    if (!query.trim()) return true;
    const pathway = pathwayMap.get(asset.pathway_slug);
    const haystack = `${asset.title} ${asset.asset_type} ${asset.pathway_slug} ${pathway?.title || ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [assets, pathwayMap, query, studio]);
  const folders = useMemo(() => pathways.map((pathway) => ({ ...pathway, assets: visible.filter((asset) => asset.pathway_slug === pathway.slug) })).filter((folder) => folder.assets.length), [pathways, visible]);

  return <div className="pathway-asset-index-page">
    <div className="studio-page-heading"><div><span className="eyebrow">Publishing · Library</span><h1>Pathway Assets</h1><p className="admin-lede">Every Pathway is a parent folder. Carousel decks, individual slides, posts, Stories, captions, thumbnails, uploads, Video Studio projects, and renders stay attached here and can be reopened later.</p></div></div>
    <section className="admin-card pathway-asset-index-toolbar"><label><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Pathways or assets…"/></label><div>{(["all","carousel","video"] as const).map((key) => <button type="button" key={key} className={studio === key ? "is-active" : ""} onClick={() => setStudio(key)}>{key === "all" ? "Everything" : key === "carousel" ? "Carousel + Social" : "Video Studio"}</button>)}</div><span>{visible.length} assets</span></section>
    <div className="pathway-folder-index">{folders.map((folder) => <section className="admin-card pathway-folder-index-card" key={folder.slug}><header><div><span className="section-kicker">{folder.collection}</span><h2><FolderOpen size={20}/>{folder.title}</h2></div><strong>{folder.assets.length}</strong></header><div className="pathway-folder-index-assets">{folder.assets.map((asset) => <article key={asset.id}><i className={`is-${asset.studio}`}>{asset.studio === "video" ? <Film size={15}/> : <Layers3 size={15}/>}</i><div><span>{asset.asset_type.replaceAll("-"," ")} · v{asset.version}</span><strong>{asset.title}</strong><small>{asset.status} · {new Date(asset.updated_at).toLocaleString()}</small></div><div>{asset.editable ? <Link className="button small" href={`/admin/pathway-assets/${asset.id}`}><Pencil size={13}/> Edit source</Link> : null}{(asset.storage_path || asset.public_url) ? <a className="button small" href={`/api/admin/pathway-assets/download?id=${asset.id}`}><Download size={13}/> Download</a> : null}</div></article>)}</div></section>)}</div>
    {!folders.length ? <div className="studio-empty-state"><FolderOpen size={28}/><strong>No matching assets</strong><p>Save a creative from Carousel Studio or Video Studio and its Pathway folder will appear here.</p></div> : null}
  </div>;
}

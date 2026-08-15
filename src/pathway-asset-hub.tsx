"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Film, FolderOpen, Layers3 } from "lucide-react";
import { PathwayAssetLibrary } from "@/pathway-asset-library";

type PathwayOption = { slug: string; title: string; summary: string; collection: string };
type Studio = "carousel" | "video";

export function PathwayAssetHub({ pathways, aiReady }: { pathways: PathwayOption[]; aiReady: boolean }) {
  const initialSlug = pathways.find((pathway) => pathway.slug === "jesus-is-god")?.slug ?? pathways[0]?.slug ?? "";
  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const [destinationStudio, setDestinationStudio] = useState<Studio>("carousel");
  const pathway = useMemo(() => pathways.find((item) => item.slug === selectedSlug) ?? pathways[0], [pathways, selectedSlug]);

  if (!pathway) return null;

  return <main className="admin-page pathway-assets-page">
    <header className="admin-page-header pathway-assets-page-head">
      <div>
        <span className="section-kicker">Creative system</span>
        <h1>Pathway Assets</h1>
        <p>Every Pathway owns its media. Carousels, posts, Stories, thumbnails, video outputs, uploaded references, generated images, and copy stay together here.</p>
      </div>
      <FolderOpen size={30}/>
    </header>

    <section className="admin-card pathway-assets-control">
      <label>
        <span>Pathway folder</span>
        <select value={selectedSlug} onChange={(event) => setSelectedSlug(event.target.value)}>
          {pathways.map((item) => <option value={item.slug} key={item.slug}>{item.title}</option>)}
        </select>
      </label>
      <div className="pathway-assets-destination">
        <span>New uploads + Sol images go to</span>
        <div>
          <button type="button" className={destinationStudio === "carousel" ? "is-active" : ""} onClick={() => setDestinationStudio("carousel")}><Layers3 size={16}/> Carousel + Social</button>
          <button type="button" className={destinationStudio === "video" ? "is-active" : ""} onClick={() => setDestinationStudio("video")}><Film size={16}/> Video</button>
        </div>
      </div>
      <div className="pathway-assets-jump">
        <Link className="button" href="/admin/carousel-studio"><Layers3 size={15}/> Open Carousel Studio</Link>
        <Link className="button" href="/admin/video-studio"><Film size={15}/> Open Video Studio</Link>
      </div>
    </section>

    <PathwayAssetLibrary pathwaySlug={pathway.slug} pathwayTitle={pathway.title} studio={destinationStudio} aiReady={aiReady}/>
  </main>;
}

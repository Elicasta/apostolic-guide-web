"use client";

import { Clock3, Headphones, Play, Search, Video } from "lucide-react";
import { useMemo, useState } from "react";
import type { MediaItem } from "./data";

const types = ["All", "Teaching", "Short", "Music"] as const;

function MediaIcon({ type }: { type: MediaItem["type"] }) {
  if (type === "Music") return <Headphones size={30} />;
  if (type === "Short") return <Video size={30} />;
  return <Play size={30} />;
}

export function MediaLibrary({ items }: { items: MediaItem[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<(typeof types)[number]>("All");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      const typeMatch = type === "All" || item.type === type;
      const queryMatch = !normalized || `${item.title} ${item.summary} ${item.type}`.toLowerCase().includes(normalized);
      return typeMatch && queryMatch;
    });
  }, [items, query, type]);

  return (
    <div className="interactive-directory">
      <div className="directory-toolbar">
        <label className="directory-search">
          <Search size={18} aria-hidden />
          <span className="sr-only">Search media</span>
          <input value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search teachings, music, and shorts" />
        </label>
        <div className="filter-pills" aria-label="Filter media by type">
          {types.map((item) => <button className={type === item ? "active" : ""} key={item} onClick={() => setType(item)} type="button">{item}</button>)}
        </div>
      </div>

      <div className="media-library-grid">
        {filtered.map((item, index) => {
          const content = (
            <>
              <div className={`media-cover media-cover-${item.type.toLowerCase()}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <MediaIcon type={item.type} />
                <small>{item.type}</small>
              </div>
              <div className="media-copy">
                <span className="eyebrow">{item.type}</span>
                <h2>{item.title}</h2>
                <p>{item.summary}</p>
                <div className="media-meta"><Clock3 size={14} /> {item.duration}<span>{item.url ? "Available now" : "Coming soon"}</span></div>
              </div>
            </>
          );
          return item.url ? <a className="media-library-card" href={item.url} key={item.slug}>{content}</a> : <article className="media-library-card" key={item.slug}>{content}</article>;
        })}
      </div>
    </div>
  );
}

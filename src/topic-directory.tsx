"use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Topic } from "./data";

const categories = ["All", "God and Christ", "Salvation", "Biblical interpretation"] as const;

export function TopicDirectory({ topics }: { topics: Topic[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return topics.filter((topic) => {
      const categoryMatch = category === "All" || topic.category === category;
      const queryMatch = !normalized || `${topic.title} ${topic.claim} ${topic.summary} ${topic.keyScriptures.join(" ")}`.toLowerCase().includes(normalized);
      return categoryMatch && queryMatch;
    });
  }, [category, query, topics]);

  return (
    <div className="interactive-directory">
      <div className="directory-toolbar">
        <label className="directory-search">
          <Search size={18} aria-hidden />
          <span className="sr-only">Search topics</span>
          <input value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search a doctrine, phrase, or Scripture" />
        </label>
        <div className="filter-pills" aria-label="Filter topics by category">
          {categories.map((item) => (
            <button className={item === category ? "active" : ""} key={item} onClick={() => setCategory(item)} type="button">
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="directory-count"><strong>{filtered.length}</strong> topic{filtered.length === 1 ? "" : "s"}</div>

      {filtered.length ? (
        <div className="topic-directory-grid">
          {filtered.map((topic, index) => (
            <Link className="topic-directory-card" href={`/topics/${topic.slug}`} key={topic.slug} data-reveal>
              <span className="topic-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="eyebrow">{topic.category}</span>
              <h2>{topic.title}</h2>
              <p>{topic.claim}</p>
              <div className="scripture-chip-row">
                {topic.keyScriptures.slice(0, 3).map((reference) => <span key={reference}>{reference}</span>)}
              </div>
              <span className="text-link">Open topic <ArrowRight size={16} /></span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state"><h2>No matching topic.</h2><p>Try a broader phrase or clear the category filter.</p></div>
      )}
    </div>
  );
}

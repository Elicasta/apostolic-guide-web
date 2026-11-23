"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import SlideContent from "./SlideContent";
import { parseTeleprompterDocument } from "@/lib/teleprompter/parser";
import { getDoctrineBackupRaw, getLegacyArchiveRaw, loadTeleprompterDocuments } from "@/lib/teleprompter/seeded-storage";
import { getDoctrineSeedDocuments } from "@/lib/teleprompter/doctrine";
import {
  getPathwaySeedDocuments,
  pathwayFromDocumentId,
  publicPathwayUrl,
} from "@/lib/teleprompter/pathways";
import {
  createTeleprompterDocument,
  duplicateTeleprompterDocument,
  saveTeleprompterDocuments,
} from "@/lib/teleprompter/storage";
import type {
  TeleprompterDocument,
  TeleprompterTheme,
} from "@/lib/teleprompter/types";

type LibraryCategory = "pathways" | "deepdives" | "personal" | "other";

const rewrittenDoctrine = new Map(getDoctrineSeedDocuments().map((document) => [document.id, document]));
const publicPathwayScripts = getPathwaySeedDocuments();
const currentPathways = new Map(publicPathwayScripts.map((document) => [document.id, document]));
const pathwayOrder = new Map(publicPathwayScripts.map((document, index) => [document.id, index]));

function categoryFor(document: TeleprompterDocument): LibraryCategory {
  if (currentPathways.has(document.id)) return "pathways";
  if (document.id.startsWith("ag-doctrine-ep-")) return "deepdives";
  if (document.id.startsWith("eli-castaneda-episode-")) return "personal";
  return "other";
}

function statusFor(document: TeleprompterDocument) {
  const canonical = currentPathways.get(document.id);
  if (canonical) return document.title === canonical.title && document.content === canonical.content
    ? "Matches online Pathway"
    : "Edited · differs from Pathway";
  const rewrite = rewrittenDoctrine.get(document.id);
  if (rewrite) return document.content === rewrite.content ? "Deep Dive master" : "Edited Deep Dive";
  if (document.id.startsWith("apostolic-guide-episode-")) return "Older episode";
  if (categoryFor(document) === "personal") return "Personal channel";
  return "Your script";
}

export default function TeleprompterLibrary() {
  const [documents, setDocuments] = useState<TeleprompterDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<LibraryCategory>("pathways");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewTheme, setPreviewTheme] = useState<TeleprompterTheme>("night");
  const [hydrated, setHydrated] = useState(false);
  const [hasDoctrineBackup, setHasDoctrineBackup] = useState(false);
  const [hasLegacyArchive, setHasLegacyArchive] = useState(false);

  useEffect(() => {
    const loaded = loadTeleprompterDocuments();
    const requested = new URLSearchParams(window.location.search).get("doc");
    const requestedDocument = loaded.find((doc) => doc.id === requested);
    const selected = requestedDocument ?? loaded.find((doc) => categoryFor(doc) === "pathways") ?? loaded[0];
    // Read browser-local storage after mount; schedule state hydration outside
    // the effect's synchronous render cycle to avoid cascading renders.
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setDocuments(loaded);
      setHasDoctrineBackup(Boolean(getDoctrineBackupRaw()));
      setHasLegacyArchive(Boolean(getLegacyArchiveRaw()));
      setCategory(requestedDocument ? categoryFor(requestedDocument) : "pathways");
      setSelectedId(selected?.id ?? "");
      setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => saveTeleprompterDocuments(documents), 350);
    return () => window.clearTimeout(timer);
  }, [documents, hydrated]);

  const selected = useMemo(
    () => documents.find((doc) => doc.id === selectedId) ?? documents[0],
    [documents, selectedId],
  );
  const slides = useMemo(
    () => parseTeleprompterDocument(selected?.content ?? ""),
    [selected?.content],
  );
  const counts = useMemo(() => ({
    pathways: documents.filter((doc) => categoryFor(doc) === "pathways").length,
    deepdives: documents.filter((doc) => categoryFor(doc) === "deepdives").length,
    personal: documents.filter((doc) => categoryFor(doc) === "personal").length,
    other: documents.filter((doc) => categoryFor(doc) === "other").length,
  }), [documents]);
  const hasUnarchivedLegacy = documents.some((doc) => doc.id.startsWith("apostolic-guide-episode-"));
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return documents.filter((doc) => {
      if (needle) return `${doc.title} ${doc.content}`.toLowerCase().includes(needle);
      return categoryFor(doc) === category;
    }).sort((a, b) => {
      const aCategory = categoryFor(a);
      const bCategory = categoryFor(b);
      if (aCategory === "pathways" && bCategory === "pathways") {
        return (pathwayOrder.get(a.id) ?? 999) - (pathwayOrder.get(b.id) ?? 999);
      }
      if (aCategory === "deepdives" && bCategory === "deepdives") {
        return a.id.localeCompare(b.id);
      }
      return 0;
    });
  }, [category, documents, search]);

  // Never access an out-of-range slide while the editor removes sections.
  const safePreviewIndex = Math.min(previewIndex, Math.max(slides.length - 1, 0));

  const updateSelected = (
    patch: Partial<Pick<TeleprompterDocument, "title" | "content">>,
  ) => {
    const now = new Date().toISOString();
    setDocuments((current) =>
      current.map((doc) =>
        doc.id === selectedId ? { ...doc, ...patch, updatedAt: now } : doc,
      ),
    );
  };

  const createNew = () => {
    const doc = createTeleprompterDocument();
    setDocuments((current) => [doc, ...current]);
    setSelectedId(doc.id);
    setCategory("other");
    setSearch("");
    setPreviewIndex(0);
  };

  const duplicate = () => {
    if (!selected) return;
    const copy = duplicateTeleprompterDocument(selected);
    setDocuments((current) => [copy, ...current]);
    setSelectedId(copy.id);
    setCategory("other");
    setSearch("");
    setPreviewIndex(0);
  };

  const exportPreviousDoctrineScripts = () => {
    const raw = getDoctrineBackupRaw();
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "apostolic-guide-doctrine-before-rewrite.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportArchivedEpisodes = () => {
    const raw = getLegacyArchiveRaw();
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "apostolic-guide-archived-episodes-01-12.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const restorePathwayFromWebsite = () => {
    if (!selected) return;
    const canonical = currentPathways.get(selected.id);
    if (!canonical || (selected.content === canonical.content && selected.title === canonical.title)) return;
    if (!window.confirm("Restore the exact public Pathway wording? Your current version will be saved under My scripts first.")) return;
    const backup = {
      ...duplicateTeleprompterDocument(selected),
      title: `${selected.title} · Backup before Pathway restore`,
    };
    setDocuments((current) => [
      backup,
      ...current.map((document) => document.id === canonical.id
        ? { ...canonical, createdAt: document.createdAt, updatedAt: new Date().toISOString() }
        : document),
    ]);
    setPreviewIndex(0);
  };

  const remove = () => {
    if (!selected || documents.length <= 1) return;
    if (!window.confirm(`Delete “${selected.title}”?`)) return;
    const remaining = documents.filter((doc) => doc.id !== selected.id);
    setDocuments(remaining);
    const next = remaining.find((doc) => categoryFor(doc) === category) ?? remaining[0];
    setSelectedId(next?.id ?? "");
    if (next) setCategory(categoryFor(next));
    setPreviewIndex(0);
  };

  if (!hydrated || !selected) {
    return <main className="tp-library-shell tp-library-loading">Loading Teleprompter…</main>;
  }

  const presentUrl = `/teleprompter?doc=${encodeURIComponent(selected.id)}`;

  return (
    <main className="tp-library-shell">
      <div className="tp-library-grid">
        <aside className="tp-library-sidebar">
          <div className="tp-library-brand">
            <Image
              src="/brand/apostolic-guide-wordmark-reversed.png"
              alt="Apostolic Guide"
              width={164}
              height={34}
              priority
            />
            <p>Script library · 2026</p>
            <div className="tp-library-release">
              <strong>20 Pathway episodes</strong> mirror the website's Scripture, explanations and transitions.
              The intro and CTA are recording-only. <strong>24 Deep Dives</strong> are separate.
              {hasUnarchivedLegacy
                ? " Older scripts could not be archived on this browser. Free up storage and reload."
                : hasLegacyArchive
                  ? " Previous numbered episodes are archived."
                  : ""}
            </div>
            <button type="button" onClick={createNew} className="tp-library-primary">
              + New script
            </button>
            {hasLegacyArchive ? (
              <button type="button" onClick={exportArchivedEpisodes} className="tp-library-backup">
                Download archived older episodes
              </button>
            ) : null}
            {hasDoctrineBackup ? (
              <button type="button" onClick={exportPreviousDoctrineScripts} className="tp-library-backup">
                Export previous doctrine versions
              </button>
            ) : null}
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search scripts"
              aria-label="Search scripts"
            />
            <div className="tp-library-filters" role="group" aria-label="Script categories">
              {([
                ["pathways", "Pathways", counts.pathways],
                ["deepdives", "Deep Dives", counts.deepdives],
                ["personal", "Personal", counts.personal],
                ["other", "My scripts", counts.other],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={category === value}
                  className={category === value ? "is-selected" : ""}
                  onClick={() => {
                    setCategory(value);
                    setSearch("");
                    if (categoryFor(selected) !== value) {
                      const next = documents.find((doc) => categoryFor(doc) === value);
                      if (next) {
                        setSelectedId(next.id);
                        setPreviewIndex(0);
                      }
                    }
                  }}
                >
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
            {search.trim() ? <p className="tp-library-search-hint">Searching all scripts</p> : null}
          </div>

          <div className="tp-library-list" aria-label="Scroll to browse scripts">
            {filtered.length === 0 ? (
              <p className="tp-library-empty">{search.trim() ? "No matching scripts." : "No scripts in this category."}</p>
            ) : null}
            {filtered.map((doc) => {
              const sectionCount = parseTeleprompterDocument(doc.content).length;
              const active = doc.id === selected.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  className={active ? "is-active" : ""}
                  onClick={() => {
                    setSelectedId(doc.id);
                    setCategory(categoryFor(doc));
                    setPreviewIndex(0);
                  }}
                >
                  <strong>{doc.title}</strong>
                  <span className="tp-library-list-status">{statusFor(doc)}</span>
                  <span>{sectionCount} sections · {formatUpdated(doc.updatedAt)}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="tp-editor-pane">
          <header>
            <input
              value={selected.title}
              onChange={(event) => updateSelected({ title: event.target.value })}
              aria-label="Script title"
              className="tp-title-input"
            />
            <div>
              <button type="button" onClick={duplicate}>Duplicate</button>
              <button type="button" onClick={remove} disabled={documents.length <= 1}>Delete</button>
              {pathwayFromDocumentId(selected.id) ? (
                <a
                  href={publicPathwayUrl(pathwayFromDocumentId(selected.id)!.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                >Website</a>
              ) : null}
              <a href={presentUrl}>Present</a>
            </div>
          </header>

          {currentPathways.has(selected.id) ? (
            <div className="tp-pathway-source">
              <span>{statusFor(selected)}. The study body follows the public Pathway word for word; the intro and CTA are separate.</span>
              {statusFor(selected).startsWith("Edited") ? (
                <button type="button" onClick={restorePathwayFromWebsite}>Restore website wording</button>
              ) : null}
            </div>
          ) : null}
          <textarea
            value={selected.content}
            onChange={(event) => updateSelected({ content: event.target.value })}
            spellCheck
            aria-label="Teleprompter script"
          />

          <div className="tp-editor-help">
            <span><b>---</b> new page</span>
            <span><b>#</b> section title</span>
            <span><b>**word**</b> emphasis</span>
            <span><b>&gt;</b> Scripture</span>
            <span><b>@ref</b> reference</span>
            <span><b>@note</b> speaker note</span>
            <span>Autosaved locally</span>
          </div>
        </section>

        <aside className="tp-preview-pane">
          <header>
            <div>
              <p>Section preview</p>
              <span>{safePreviewIndex + 1} / {slides.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setPreviewTheme((value) => value === "night" ? "day" : "night")}
            >
              {previewTheme === "night" ? "Day" : "Night"}
            </button>
          </header>

          <div className="tp-preview-stage">
            <div className={`tp-preview-canvas tp-theme-${previewTheme}`}>
              <SlideContent
                slide={slides[safePreviewIndex]}
                theme={previewTheme}
                fontScale={0.8}
                compact
              />
            </div>
          </div>

          <div className="tp-preview-controls">
            <button
              type="button"
              onClick={() => setPreviewIndex(Math.max(0, safePreviewIndex - 1))}
              disabled={safePreviewIndex <= 0}
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => setPreviewIndex(Math.min(slides.length - 1, safePreviewIndex + 1))}
              disabled={safePreviewIndex >= slides.length - 1}
            >
              Next →
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

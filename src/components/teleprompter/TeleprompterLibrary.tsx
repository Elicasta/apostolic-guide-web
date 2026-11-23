"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import SlideContent from "./SlideContent";
import { parseTeleprompterDocument } from "@/lib/teleprompter/parser";
import { getDoctrineBackupRaw, loadTeleprompterDocuments } from "@/lib/teleprompter/seeded-storage";
import {
  createTeleprompterDocument,
  duplicateTeleprompterDocument,
  saveTeleprompterDocuments,
} from "@/lib/teleprompter/storage";
import type {
  TeleprompterDocument,
  TeleprompterTheme,
} from "@/lib/teleprompter/types";

export default function TeleprompterLibrary() {
  const [documents, setDocuments] = useState<TeleprompterDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewTheme, setPreviewTheme] = useState<TeleprompterTheme>("night");
  const [hydrated, setHydrated] = useState(false);
  const [hasDoctrineBackup, setHasDoctrineBackup] = useState(false);

  useEffect(() => {
    const loaded = loadTeleprompterDocuments();
    const requested = new URLSearchParams(window.location.search).get("doc");
    const selected = loaded.find((doc) => doc.id === requested) ?? loaded[0];
    // Read browser-local storage after mount; schedule state hydration outside
    // the effect's synchronous render cycle to avoid cascading renders.
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setDocuments(loaded);
      setHasDoctrineBackup(Boolean(getDoctrineBackupRaw()));
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
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((doc) =>
      `${doc.title} ${doc.content}`.toLowerCase().includes(needle),
    );
  }, [documents, search]);

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
    setPreviewIndex(0);
  };

  const duplicate = () => {
    if (!selected) return;
    const copy = duplicateTeleprompterDocument(selected);
    setDocuments((current) => [copy, ...current]);
    setSelectedId(copy.id);
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

  const remove = () => {
    if (!selected || documents.length <= 1) return;
    if (!window.confirm(`Delete “${selected.title}”?`)) return;
    const remaining = documents.filter((doc) => doc.id !== selected.id);
    setDocuments(remaining);
    setSelectedId(remaining[0]?.id ?? "");
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
            <p>Teleprompter</p>
            <button type="button" onClick={createNew} className="tp-library-primary">
              + New script
            </button>
            {hasDoctrineBackup ? (
              <button type="button" onClick={exportPreviousDoctrineScripts} className="tp-library-backup">
                Export previous doctrine scripts
              </button>
            ) : null}
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search scripts"
              aria-label="Search scripts"
            />
          </div>

          <div className="tp-library-list">
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
                    setPreviewIndex(0);
                  }}
                >
                  <strong>{doc.title}</strong>
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
              <a href={presentUrl}>Present</a>
            </div>
          </header>

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

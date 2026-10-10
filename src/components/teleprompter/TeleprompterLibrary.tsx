"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import SlideContent from "./SlideContent";
import { parseTeleprompterDocument } from "@/lib/teleprompter/parser";
import {
  createTeleprompterDocument,
  duplicateTeleprompterDocument,
  loadTeleprompterDocuments,
  saveTeleprompterDocuments,
} from "@/lib/teleprompter/storage";
import {
  deleteCloudDocument,
  getCloudBaselines,
  hydrateCloudLibrary,
  saveCloudDocument,
} from "@/lib/teleprompter/cloud-storage";
import type {
  TeleprompterDocument,
  TeleprompterTheme,
} from "@/lib/teleprompter/types";

interface ScriptRevision { revision: number; title: string; content: string; created_at: string }

export default function TeleprompterLibrary() {
  const [documents, setDocuments] = useState<TeleprompterDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewTheme, setPreviewTheme] = useState<TeleprompterTheme>("night");
  const [hydrated, setHydrated] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("Connecting to cloud…");
  const [history, setHistory] = useState<ScriptRevision[] | null>(null);
  const saveTimers = useRef<Record<string, number>>({});
  const saveChains = useRef<Record<string, Promise<void>>>({});

  useEffect(() => {
    let disposed = false;
    const loaded = loadTeleprompterDocuments();
    const requested = new URLSearchParams(window.location.search).get("doc");
    const initialize = async () => {
      let next = loaded;
      try {
        const result = await hydrateCloudLibrary(loaded);
        next = result.documents;
        if (!disposed) setCloudStatus(result.recoveryCount
          ? `${result.recoveryCount} unsynced local edit(s) preserved as recovery copies`
          : "Cloud library connected");
      } catch {
        if (!disposed) setCloudStatus("Local mode: cloud unavailable. Changes are still saved on this device.");
      }
      if (disposed) return;
      const selected = next.find((doc) => doc.id === requested) ?? next[0];
      setDocuments(next);
      setSelectedId(selected?.id ?? "");
      setHydrated(true);
    };
    void initialize();
    return () => {
      disposed = true;
      for (const timer of Object.values(saveTimers.current)) window.clearTimeout(timer);
    };
  }, []);

  const scheduleCloudSave = (document: TeleprompterDocument) => {
    window.clearTimeout(saveTimers.current[document.id]);
    setCloudStatus("Saving…");
    saveTimers.current[document.id] = window.setTimeout(() => {
      const previous = saveChains.current[document.id] ?? Promise.resolve();
      saveChains.current[document.id] = previous.catch(() => undefined).then(async () => {
        try {
          const expectedRevision = getCloudBaselines()[document.id]?.revision ?? 0;
          await saveCloudDocument(document, expectedRevision);
          setCloudStatus("Saved to cloud");
        } catch (error) {
          setCloudStatus(error instanceof Error && (error as Error & { status?: number }).status === 409
            ? "Conflict: another device changed this script. Your local version is preserved."
            : "Cloud save failed. Your local version is preserved.");
        }
      });
    }, 950);
  };

  const openHistory = async () => {
    if (!selectedId) return;
    try {
      const response = await fetch(`/api/teleprompter/documents?history=${encodeURIComponent(selectedId)}`, { cache: "no-store" });
      if (!response.ok) throw Error("History unavailable");
      const data = await response.json() as { revisions: ScriptRevision[] };
      setHistory(data.revisions);
    } catch { setCloudStatus("Could not load document history."); }
  };

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

  useEffect(() => {
    setPreviewIndex((index) => Math.min(index, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  const updateSelected = (
    patch: Partial<Pick<TeleprompterDocument, "title" | "content">>,
  ) => {
    const current = documents.find(doc => doc.id === selectedId);
    if (!current) return;
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    setDocuments(items => items.map(doc => doc.id === selectedId ? updated : doc));
    scheduleCloudSave(updated);
  };

  const createNew = () => {
    const doc = createTeleprompterDocument();
    setDocuments((current) => [doc, ...current]);
    setSelectedId(doc.id);
    setPreviewIndex(0);
    scheduleCloudSave(doc);
  };

  const duplicate = () => {
    if (!selected) return;
    const copy = duplicateTeleprompterDocument(selected);
    setDocuments((current) => [copy, ...current]);
    setSelectedId(copy.id);
    setPreviewIndex(0);
    scheduleCloudSave(copy);
  };

  const remove = async () => {
    if (!selected || documents.length <= 1) return;
    if (!window.confirm(`Delete “${selected.title}”?`)) return;
    const revision = getCloudBaselines()[selected.id]?.revision;
    window.clearTimeout(saveTimers.current[selected.id]);
    try {
      await (saveChains.current[selected.id] ?? Promise.resolve()).catch(() => undefined);
      if (revision) {
        await deleteCloudDocument(selected.id, getCloudBaselines()[selected.id]?.revision ?? revision);
      }
    } catch {
      setCloudStatus("Delete failed. Document was kept to prevent data loss.");
      return;
    }
    const remaining = documents.filter((doc) => doc.id !== selected.id);
    setDocuments(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setPreviewIndex(0);
    setHistory(null);
  };

  const exportMarkdown = () => {
    if (!selected) return;
    const blob = new Blob([selected.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.title.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80) || "script"}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
                    setHistory(null);
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
              <button type="button" onClick={exportMarkdown}>Export .md</button>
              <button type="button" onClick={() => void openHistory()}>History</button>
              <button type="button" onClick={() => void remove()} disabled={documents.length <= 1}>Delete</button>
              <a href={presentUrl}>Present</a>
            </div>
          </header>

          <textarea
            value={selected.content}
            onChange={(event) => updateSelected({ content: event.target.value })}
            spellCheck
            aria-label="Teleprompter script"
          />

          {history !== null && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid currentColor", maxHeight: 160, overflowY: "auto" }}>
              <strong>Previous revisions</strong>
              {history.length === 0 && <p>No previous revisions yet.</p>}
              {history.map(item => (
                <div key={item.revision} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span>Revision {item.revision} · {formatUpdated(item.created_at)}</span>
                  <button type="button" onClick={() => {
                    if (window.confirm(`Restore revision ${item.revision} as a new edit?`)) {
                      updateSelected({ title: item.title, content: item.content });
                      setHistory(null);
                    }
                  }}>Restore</button>
                </div>
              ))}
            </div>
          )}

          <div className="tp-editor-help">
            <span><b>---</b> new page</span>
            <span><b>#</b> section title</span>
            <span><b>**word**</b> emphasis</span>
            <span><b>&gt;</b> Scripture</span>
            <span><b>@ref</b> reference</span>
            <span><b>@note</b> speaker note</span>
            <span role="status" aria-live="polite">{cloudStatus}</span>
          </div>
        </section>

        <aside className="tp-preview-pane">
          <header>
            <div>
              <p>Section preview</p>
              <span>{previewIndex + 1} / {slides.length}</span>
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
                slide={slides[previewIndex]}
                theme={previewTheme}
                fontScale={0.8}
                compact
              />
            </div>
          </div>

          <div className="tp-preview-controls">
            <button
              type="button"
              onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))}
              disabled={previewIndex <= 0}
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => setPreviewIndex((index) => Math.min(slides.length - 1, index + 1))}
              disabled={previewIndex >= slides.length - 1}
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

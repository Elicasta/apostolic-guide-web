"use client";

import { useEffect, useMemo, useState } from "react";
import SlideContent from "./SlideContent";
import { parseTeleprompterDocument } from "@/lib/teleprompter/parser";
import {
  createTeleprompterDocument,
  duplicateTeleprompterDocument,
  loadTeleprompterDocuments,
  saveTeleprompterDocuments,
} from "@/lib/teleprompter/storage";
import type { TeleprompterDocument, TeleprompterMode, TeleprompterTheme } from "@/lib/teleprompter/types";

export default function TeleprompterLibrary() {
  const [documents, setDocuments] = useState<TeleprompterDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewTheme, setPreviewTheme] = useState<TeleprompterTheme>("night");
  const [previewMode, setPreviewMode] = useState<TeleprompterMode>("cue");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loaded = loadTeleprompterDocuments();
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("doc");
    const selected = loaded.find((doc) => doc.id === requested) ?? loaded[0];
    setDocuments(loaded);
    setSelectedId(selected?.id ?? "");
    setHydrated(true);
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

  useEffect(() => {
    setPreviewIndex((index) => Math.min(index, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((doc) => `${doc.title} ${doc.content}`.toLowerCase().includes(needle));
  }, [documents, search]);

  const updateSelected = (patch: Partial<Pick<TeleprompterDocument, "title" | "content">>) => {
    const now = new Date().toISOString();
    setDocuments((current) =>
      current.map((doc) => (doc.id === selectedId ? { ...doc, ...patch, updatedAt: now } : doc)),
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

  const remove = () => {
    if (!selected || documents.length <= 1) return;
    if (!window.confirm(`Delete “${selected.title}”?`)) return;
    const remaining = documents.filter((doc) => doc.id !== selected.id);
    setDocuments(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setPreviewIndex(0);
  };

  const presentUrl = selected ? `/teleprompter?doc=${encodeURIComponent(selected.id)}` : "/teleprompter";
  const nightPreview = previewTheme === "night";

  if (!hydrated || !selected) {
    return <main style={shellStyle}><div style={{ margin: "auto", color: "#8E887E" }}>Loading Teleprompter…</div></main>;
  }

  return (
    <main style={shellStyle}>
      <style>{`
        .tp-library-grid { display:grid; grid-template-columns:minmax(220px,.72fr) minmax(360px,1.22fr) minmax(300px,1fr); height:100%; }
        @media (max-width: 980px) { .tp-library-grid { grid-template-columns:minmax(190px,.7fr) minmax(330px,1.3fr); } .tp-preview-pane { display:none !important; } }
        @media (max-width: 680px) { .tp-library-grid { display:block; overflow-y:auto; } .tp-script-list { min-height:260px; max-height:42vh; } .tp-editor-pane { min-height:58vh; } }
      `}</style>

      <div className="tp-library-grid">
        <aside className="tp-script-list" style={{ borderRight: "1px solid #282621", background: "#0F0F0D", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "22px 18px 14px", borderBottom: "1px solid #24221E" }}>
            <div style={eyebrowStyle}>Apostolic Guide</div>
            <h1 style={{ margin: "8px 0 16px", fontSize: 27, letterSpacing: "-.045em", lineHeight: 1 }}>Teleprompter</h1>
            <button type="button" onClick={createNew} style={goldButtonStyle}>+ New script</button>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search scripts" style={{ ...inputStyle, marginTop: 9, fontSize: 13, letterSpacing: 0, textTransform: "none" }} />
          </div>

          <div style={{ padding: 10, overflowY: "auto", flex: 1 }}>
            {filtered.map((doc) => {
              const slideCount = parseTeleprompterDocument(doc.content).length;
              const active = doc.id === selected.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => { setSelectedId(doc.id); setPreviewIndex(0); }}
                  style={{
                    width: "100%",
                    appearance: "none",
                    textAlign: "left",
                    border: `1px solid ${active ? "#6E5939" : "transparent"}`,
                    background: active ? "#1B1813" : "transparent",
                    color: active ? "#EFE8DA" : "#A29C92",
                    borderRadius: 13,
                    padding: "12px 12px",
                    cursor: "pointer",
                    marginBottom: 4,
                  }}
                >
                  <div style={{ fontWeight: 650, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
                  <div style={{ marginTop: 6, color: active ? "#9F8B67" : "#5F5A53", fontSize: 11 }}>{slideCount} slides · {formatUpdated(doc.updatedAt)}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="tp-editor-pane" style={{ minWidth: 0, display: "flex", flexDirection: "column", background: "#121210" }}>
          <header style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid #292722" }}>
            <input
              value={selected.title}
              onChange={(event) => updateSelected({ title: event.target.value })}
              aria-label="Script title"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", color: "#F1ECE3", fontSize: 18, fontWeight: 680, letterSpacing: "-.02em" }}
            />
            <div style={{ display: "flex", gap: 7 }}>
              <button type="button" onClick={duplicate} style={smallButtonStyle}>Duplicate</button>
              <button type="button" onClick={remove} disabled={documents.length <= 1} style={{ ...smallButtonStyle, color: documents.length <= 1 ? "#4F4B44" : "#A77F76" }}>Delete</button>
              <a href={presentUrl} style={{ ...goldButtonStyle, width: "auto", padding: "10px 14px", textDecoration: "none" }}>Present</a>
            </div>
          </header>

          <textarea
            value={selected.content}
            onChange={(event) => updateSelected({ content: event.target.value })}
            spellCheck
            aria-label="Teleprompter script"
            style={{
              flex: 1,
              width: "100%",
              resize: "none",
              border: 0,
              outline: 0,
              background: "#121210",
              color: "#DCD6CC",
              padding: "26px clamp(18px, 4vw, 48px) 48px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 15,
              lineHeight: 1.72,
              tabSize: 2,
            }}
          />

          <div style={{ borderTop: "1px solid #292722", padding: "10px 16px", display: "flex", gap: 14, flexWrap: "wrap", color: "#6F6960", fontSize: 11 }}>
            <span><b style={{ color: "#A88C61" }}>---</b> new slide</span>
            <span><b style={{ color: "#A88C61" }}>#</b> heading</span>
            <span><b style={{ color: "#A88C61" }}>**word**</b> emphasis</span>
            <span><b style={{ color: "#A88C61" }}>&gt;</b> Scripture</span>
            <span><b style={{ color: "#A88C61" }}>@ref</b> reference</span>
            <span><b style={{ color: "#A88C61" }}>@note</b> private cue</span>
            <span style={{ marginLeft: "auto" }}>Autosaved locally</span>
          </div>
        </section>

        <aside className="tp-preview-pane" style={{ minWidth: 0, display: "flex", flexDirection: "column", background: "#0E0E0C", borderLeft: "1px solid #282621" }}>
          <div style={{ padding: "16px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #24221E" }}>
            <div>
              <div style={eyebrowStyle}>Preview</div>
              <div style={{ marginTop: 5, color: "#79736A", fontSize: 11 }}>{previewIndex + 1} / {slides.length}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => setPreviewTheme((value) => value === "night" ? "day" : "night")} style={smallButtonStyle}>{nightPreview ? "Day" : "Night"}</button>
              <button type="button" onClick={() => setPreviewMode(nextMode(previewMode))} style={{ ...smallButtonStyle, textTransform: "capitalize" }}>{previewMode}</button>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, padding: 16, display: "flex" }}>
            <div style={{ flex: 1, borderRadius: 18, border: `1px solid ${nightPreview ? "#282621" : "#D8CFBD"}`, background: nightPreview ? "#0C0C0B" : "#F3EFE5", padding: "28px 24px", overflow: "auto", display: "flex", alignItems: "center" }}>
              <SlideContent slide={slides[previewIndex]} mode={previewMode} theme={previewTheme} fontScale={.8} compact />
            </div>
          </div>

          <div style={{ padding: "0 16px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button type="button" onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))} style={smallButtonStyle}>← Previous</button>
            <button type="button" onClick={() => setPreviewIndex((index) => Math.min(slides.length - 1, index + 1))} style={smallButtonStyle}>Next →</button>
          </div>
        </aside>
      </div>
    </main>
  );
}

function nextMode(mode: TeleprompterMode): TeleprompterMode {
  if (mode === "script") return "cue";
  if (mode === "cue") return "minimal";
  return "script";
}

function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const shellStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  overflow: "hidden",
  background: "#0C0C0B",
  color: "#F2EEE5",
  fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
};

const eyebrowStyle: React.CSSProperties = {
  color: "#B99A66",
  fontSize: 10,
  fontWeight: 760,
  letterSpacing: ".18em",
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #302E29",
  background: "#151513",
  color: "#E8E2D8",
  borderRadius: 11,
  padding: "10px 11px",
  outline: "none",
};

const goldButtonStyle: React.CSSProperties = {
  appearance: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  border: "1px solid #9D8051",
  background: "#93764A",
  color: "#0B0B0A",
  borderRadius: 11,
  padding: "11px 12px",
  fontSize: 12,
  fontWeight: 760,
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  appearance: "none",
  border: "1px solid #302E29",
  background: "#171715",
  color: "#A8A198",
  borderRadius: 10,
  padding: "9px 10px",
  fontSize: 11,
  lineHeight: 1,
  cursor: "pointer",
  textDecoration: "none",
};

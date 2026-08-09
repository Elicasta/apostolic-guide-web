"use client";

import { useMemo, useRef, useState } from "react";
import { Bold, Heading2, Italic, Link as LinkIcon, List, ListOrdered, Quote, Redo2, Undo2 } from "lucide-react";

export type EditorInitialContent = {
  id: string;
  kind: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  publishWebsite: boolean;
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
}

export function ContentEditor({ initial }: { initial?: EditorInitialContent }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [publishWebsite, setPublishWebsite] = useState(initial?.publishWebsite ?? false);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const words = useMemo(() => body.trim() ? body.trim().split(/\s+/).length : 0, [body]);
  const readingMinutes = Math.max(1, Math.ceil(words / 220));

  function changeTitle(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function wrap(before: string, after = before, placeholder = "text") {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = body.slice(start, end) || placeholder;
    const next = body.slice(0, start) + before + selected + after + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function prefix(prefixText: string) {
    const el = bodyRef.current;
    if (!el) return;
    const start = body.lastIndexOf("\n", Math.max(0, el.selectionStart - 1)) + 1;
    const next = body.slice(0, start) + prefixText + body.slice(start);
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(el.selectionStart + prefixText.length, el.selectionStart + prefixText.length); });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(initial ? `/api/admin/content/${initial.id}` : "/api/admin/content", {
      method: initial ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: initial?.kind ?? form.get("kind"), title, slug, summary, body, publishWebsite })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setState("error"); setMessage(result.error ?? "Content could not be saved."); return; }
    setState("saved");
    setMessage(`Saved ${result.item?.title ?? title}.`);
    if (!initial) window.location.assign(`/admin/content/${result.item?.id ?? ""}`);
  }

  return (
    <form className="editor-form editorial-workspace" onSubmit={submit}>
      <div className="editor-topline">
        <div className="editor-status"><span className={publishWebsite ? "status-dot status-dot-live" : "status-dot"} />{publishWebsite ? "Will publish on save" : "Draft"}</div>
        <div className="editor-stats"><span>{words.toLocaleString()} words</span><span>{readingMinutes} min read</span></div>
      </div>

      <div className="editor-meta-grid">
        <label>Content type
          {initial ? <input value={initial.kind} disabled /> : <select name="kind" defaultValue="article"><option value="article">Article</option><option value="answer">Answer</option><option value="topic">Topic</option></select>}
        </label>
        <label>URL slug<input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} placeholder="why-did-jesus-pray" required /></label>
      </div>

      <div className="editor-document">
        <input className="editor-title-input" aria-label="Title" value={title} onChange={(e) => changeTitle(e.target.value)} placeholder="Article title" required />
        <textarea className="editor-deck-input" aria-label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Write a clear summary. This becomes the article description and preview copy." required maxLength={500} />
        <div className="editor-toolbar" aria-label="Formatting toolbar">
          <button type="button" title="Heading" onClick={() => prefix("## ")}><Heading2 size={18} /></button>
          <button type="button" title="Bold" onClick={() => wrap("**")}><Bold size={18} /></button>
          <button type="button" title="Italic" onClick={() => wrap("*")}><Italic size={18} /></button>
          <button type="button" title="Quote" onClick={() => prefix("> ")}><Quote size={18} /></button>
          <button type="button" title="Bulleted list" onClick={() => prefix("- ")}><List size={18} /></button>
          <button type="button" title="Numbered list" onClick={() => prefix("1. ")}><ListOrdered size={18} /></button>
          <button type="button" title="Link" onClick={() => wrap("[", "](https://)", "link text")}><LinkIcon size={18} /></button>
          <span className="editor-toolbar-spacer" />
          <button type="button" title="Undo" onClick={() => document.execCommand("undo")}><Undo2 size={18} /></button>
          <button type="button" title="Redo" onClick={() => document.execCommand("redo")}><Redo2 size={18} /></button>
        </div>
        <textarea ref={bodyRef} className="editor-body-input" aria-label="Body" value={body} onChange={(e) => setBody(e.target.value)} required placeholder="Start writing…\n\nUse the toolbar for headings, emphasis, quotations, lists, and links." />
      </div>

      <div className="editor-publish-bar">
        <label className="publish-toggle"><input type="checkbox" checked={publishWebsite} onChange={(e) => setPublishWebsite(e.target.checked)} /><span><strong>Publish to website</strong><small>{publishWebsite ? "This article becomes public when you save." : "Keep private while you work."}</small></span></label>
        <button className="button button-crimson" disabled={state === "saving"}>{state === "saving" ? "Saving…" : initial ? (publishWebsite ? "Save & publish" : "Save draft") : (publishWebsite ? "Create & publish" : "Create draft")}</button>
      </div>
      {message && <p className={state === "error" ? "form-error" : "form-success"}>{message}</p>}
    </form>
  );
}

export function ArchiveContentButton({ id }: { id: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  async function archive() {
    if (!window.confirm("Archive this content and remove it from the public website?")) return;
    setState("working");
    const response = await fetch(`/api/admin/content/${id}`, { method: "DELETE" });
    if (!response.ok) { setState("error"); return; }
    setState("done"); window.location.assign("/admin/content");
  }
  return <button className="button button-outline" type="button" onClick={archive} disabled={state === "working" || state === "done"}>{state === "working" ? "Archiving…" : state === "error" ? "Archive failed" : "Archive content"}</button>;
}

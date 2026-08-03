"use client";

import { useState } from "react";

export type EditorInitialContent = {
  id: string;
  kind: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  publishWebsite: boolean;
};

export function ContentEditor({ initial }: { initial?: EditorInitialContent }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(initial ? `/api/admin/content/${initial.id}` : "/api/admin/content", {
      method: initial ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: initial?.kind ?? form.get("kind"),
        title: form.get("title"),
        slug: form.get("slug"),
        summary: form.get("summary"),
        body: form.get("body"),
        publishWebsite: form.get("publishWebsite") === "on"
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setMessage(result.error ?? "Content could not be saved.");
      return;
    }
    setState("saved");
    setMessage(`Saved ${result.item?.title ?? "content"}.`);
    if (!initial) event.currentTarget.reset();
  }

  return (
    <form className="editor-form" onSubmit={submit}>
      <div className="form-row">
        <label>Content type
          {initial
            ? <input value={initial.kind} disabled />
            : <select name="kind" defaultValue="article"><option value="article">Article</option><option value="answer">Answer</option><option value="topic">Topic</option></select>}
        </label>
        <label>Slug<input name="slug" defaultValue={initial?.slug} placeholder="why-did-jesus-pray" required /></label>
      </div>
      <label>Title<input name="title" defaultValue={initial?.title} required /></label>
      <label>Summary<textarea name="summary" className="editor-summary" defaultValue={initial?.summary} required /></label>
      <label>Body<textarea name="body" defaultValue={initial?.body} required placeholder="Write the first version in plain text. Structured blocks can replace this editor later." /></label>
      <label className="checkbox-label"><input type="checkbox" name="publishWebsite" defaultChecked={initial?.publishWebsite} /> Publish to the website</label>
      <button className="button button-crimson" disabled={state === "saving"}>{state === "saving" ? "Saving…" : initial ? "Save changes" : "Save content"}</button>
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
    if (!response.ok) {
      setState("error");
      return;
    }
    setState("done");
    window.location.assign("/admin/content");
  }

  return <button className="button button-outline" type="button" onClick={archive} disabled={state === "working" || state === "done"}>{state === "working" ? "Archiving…" : state === "error" ? "Archive failed" : "Archive content"}</button>;
}

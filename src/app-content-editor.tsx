"use client";

import { useState } from "react";

export function AppContentEditor({ sources }: { sources: { id: string; title: string; kind: string }[] }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);

    let payload: unknown;
    try {
      payload = JSON.parse(String(form.get("payload") ?? ""));
    } catch {
      setState("error");
      setMessage("Payload must be valid JSON.");
      return;
    }

    const response = await fetch("/api/admin/app-content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceContentItemId: form.get("sourceContentItemId"),
        entityType: form.get("entityType"),
        entityId: form.get("entityId"),
        status: form.get("status"),
        schemaVersion: 1,
        payload
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setMessage(result.error ?? "App content could not be published.");
      return;
    }

    setState("saved");
    setMessage(`App record ${result.record?.entity_id ?? "saved"} at version ${result.record?.record_version ?? "new"}.`);
  }

  return (
    <form className="editor-form" onSubmit={submit}>
      <label>Canonical source content
        <select name="sourceContentItemId" required defaultValue="">
          <option value="" disabled>Select a canonical item</option>
          {sources.map((source) => <option key={source.id} value={source.id}>{source.title} · {source.kind}</option>)}
        </select>
      </label>
      <div className="form-row">
        <label>Entity type<select name="entityType" defaultValue="scripture"><option value="scripture">Scripture</option><option value="pathway">Pathway</option><option value="objection">Objection</option><option value="category">Category</option></select></label>
        <label>Status<select name="status" defaultValue="draft"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
      </div>
      <label>Stable app entity ID<input name="entityId" required placeholder="john-14-9" /></label>
      <label>Validated app payload<textarea name="payload" required spellCheck={false} placeholder={'{\n  "id": "john-14-9",\n  "reference": "John 14:9"\n}'} /></label>
      <button className="button button-crimson" disabled={state === "saving"}>{state === "saving" ? "Validating…" : "Save app projection"}</button>
      {message && <p className={state === "error" ? "form-error" : "form-success"}>{message}</p>}
    </form>
  );
}

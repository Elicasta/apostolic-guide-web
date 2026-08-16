"use client";

import { useState } from "react";

export type AppContentSource = {
  id: string;
  title: string;
  kind: string;
  entityType?: "scripture" | "pathway" | "objection" | "category";
  entityId?: string;
  payload?: Record<string, unknown>;
};

function entityTypeForKind(kind: string): AppContentSource["entityType"] {
  if (kind === "scripture_entry") return "scripture";
  if (kind === "pathway") return "pathway";
  if (kind === "objection") return "objection";
  if (kind === "topic") return "category";
  return undefined;
}

export function AppContentEditor({ sources }: { sources: AppContentSource[] }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [entityType, setEntityType] = useState<AppContentSource["entityType"]>("pathway");
  const [entityId, setEntityId] = useState("");
  const [payloadText, setPayloadText] = useState("");

  function chooseSource(id: string) {
    setSourceId(id);
    setState("idle");
    setMessage("");
    const source = sources.find((item) => item.id === id);
    if (!source) return;
    const nextType = source.entityType ?? entityTypeForKind(source.kind);
    if (nextType) setEntityType(nextType);
    if (source.entityId) setEntityId(source.entityId);
    if (source.payload) setPayloadText(JSON.stringify(source.payload, null, 2));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);

    let payload: unknown;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      setState("error");
      setMessage("Payload must be valid JSON.");
      return;
    }

    const response = await fetch("/api/admin/app-content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceContentItemId: sourceId,
        entityType,
        entityId,
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
        <select name="sourceContentItemId" required value={sourceId} onChange={(event) => chooseSource(event.target.value)}>
          <option value="" disabled>Select a canonical item</option>
          {sources.map((source) => <option key={source.id} value={source.id}>{source.title} · {source.kind}</option>)}
        </select>
      </label>
      <div className="form-row">
        <label>Entity type<select name="entityType" value={entityType} onChange={(event) => setEntityType(event.target.value as AppContentSource["entityType"])}><option value="scripture">Scripture</option><option value="pathway">Pathway</option><option value="objection">Objection</option><option value="category">Category</option></select></label>
        <label>Status<select name="status" defaultValue="draft"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
      </div>
      <label>Stable app entity ID<input name="entityId" value={entityId} onChange={(event) => setEntityId(event.target.value)} required placeholder="john-14-9" /></label>
      <label>Validated app payload<textarea name="payload" value={payloadText} onChange={(event) => setPayloadText(event.target.value)} required spellCheck={false} placeholder={'{\n  "id": "john-14-9",\n  "reference": "John 14:9"\n}'} /></label>
      <button className="button button-crimson" disabled={state === "saving" || !sourceId || !entityId.trim() || !payloadText.trim()}>{state === "saving" ? "Validating…" : "Save app projection"}</button>
      {message && <p className={state === "error" ? "form-error" : "form-success"}>{message}</p>}
    </form>
  );
}

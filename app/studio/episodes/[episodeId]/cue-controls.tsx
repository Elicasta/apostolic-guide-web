"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export function CueControls({ episodeId, pathwayId, step, added }: { episodeId: string; pathwayId: string; step: { title: string; reference: string; explanation: string }; added: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    if (added || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/studio/episodes/${episodeId}/cues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pathwayId, ...step }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to add cue");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add cue");
    } finally { setSaving(false); }
  }

  return <div className="ag-studio-inline-action"><button disabled={added || saving} onClick={add}>{added ? "Added" : saving ? "Adding…" : <><Plus size={14}/> Cue</>}</button>{error ? <small className="ag-studio-inline-error">{error}</small> : null}</div>;
}

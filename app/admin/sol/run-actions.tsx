"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SolRunActions({ runId, status }: { runId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"cancel" | "resume" | null>(null);
  const [error, setError] = useState("");
  const canCancel = !["completed", "cancelled", "superseded"].includes(status);
  const canResume = ["failed", "stalled", "retrying", "repairing", "queued"].includes(status);

  async function act(action: "cancel" | "resume") {
    setBusy(action);
    setError("");
    try {
      const response = await fetch(`/api/admin/sol/runtime-runs/${runId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `Unable to ${action} run.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} run.`);
    } finally {
      setBusy(null);
    }
  }

  return <div>
    <div className="sol-runtime-actions">
      {canResume ? <button disabled={busy !== null} onClick={() => act("resume")}>{busy === "resume" ? "Resuming…" : "Resume"}</button> : null}
      {canCancel ? <button className="danger" disabled={busy !== null} onClick={() => act("cancel")}>{busy === "cancel" ? "Cancelling…" : "Cancel run"}</button> : null}
    </div>
    {error ? <p style={{ color: "#ffb1b8", marginTop: 8 }}>{error}</p> : null}
  </div>;
}

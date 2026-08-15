"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./video-producer-sequential.module.css";

export function VideoProducerRegeneratePanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function regenerate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/video-producer/direct", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Producer regeneration failed.");
      router.refresh();
      window.location.reload();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Producer regeneration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.flow} style={{ paddingTop: 0 }}>
      <div className={styles.flowShell}>
        <div className={styles.panel}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 420px" }}>
              <h3 className={styles.panelTitle}><RefreshCw size={17}/> Want a different edit?</h3>
              <p className={styles.panelText}>Regenerate asks Sol for a fresh editorial pass from the same timestamped source. It replaces the current plan and clears approval, but never touches the raw recording or transcript.</p>
            </div>
            <button type="button" className={styles.buttonSecondary} disabled={busy} onClick={() => void regenerate()}>{busy ? <Loader2 size={14} className={styles.spin}/> : <RefreshCw size={14}/>} Regenerate edit</button>
          </div>
          {error ? <div className={`${styles.notice} ${styles.warning}`} style={{ marginTop: 12 }}>{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

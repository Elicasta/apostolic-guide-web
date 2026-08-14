"use client";

import { useEffect, useRef } from "react";

type ProjectList = {
  projects?: Array<{ id?: string; status?: string }>;
};

type RecoveryResult = {
  state?: "uploaded" | "reset" | "unchanged";
};

export function VideoProducerUploadRecovery() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let cancelled = false;

    async function recover() {
      try {
        const projectsResponse = await fetch("/api/admin/video-producer/projects", { cache: "no-store" });
        if (!projectsResponse.ok) return;
        const payload = await projectsResponse.json().catch(() => ({})) as ProjectList;
        const stuck = (payload.projects ?? []).filter((project) => project.status === "uploading" && project.id);
        if (!stuck.length || cancelled) return;

        let changed = false;
        for (const project of stuck) {
          if (!project.id || cancelled) break;
          const response = await fetch("/api/admin/video-producer/upload-recovery", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ projectId: project.id })
          });
          if (!response.ok) continue;
          const result = await response.json().catch(() => ({})) as RecoveryResult;
          if (result.state === "uploaded" || result.state === "reset") changed = true;
        }
        if (changed && !cancelled) window.location.reload();
      } catch {
        // Recovery is best-effort. The workspace remains usable and the project can be retried manually.
      }
    }

    void recover();
    return () => { cancelled = true; };
  }, []);

  return null;
}

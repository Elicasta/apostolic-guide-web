"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Film, Loader2 } from "lucide-react";

const LAST_PROJECT_KEY = "apostolic-guide:video-producer:last-project";
const WORKSPACE_SELECT = "main.min-h-screen header select";

type ProjectDetail = {
  project?: { id: string; title: string; status: string } | null;
  renders?: Array<{ id: string; status: string; output_storage_path?: string | null }>;
};

function currentProjectId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("project")
    || window.localStorage.getItem(LAST_PROJECT_KEY)
    || "";
}

export function VideoProducerMasterDownload() {
  const [projectId, setProjectId] = useState("");
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const syncProject = useCallback(() => setProjectId(currentProjectId()), []);

  useEffect(() => {
    syncProject();
    const onPopState = () => syncProject();
    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || !target.matches(WORKSPACE_SELECT)) return;
      window.setTimeout(syncProject, 0);
    };
    window.addEventListener("popstate", onPopState);
    document.addEventListener("change", onChange, true);
    const timer = window.setInterval(syncProject, 2000);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("change", onChange, true);
      window.clearInterval(timer);
    };
  }, [syncProject]);

  useEffect(() => {
    if (!projectId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/video-producer/projects/${projectId}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setDetail(data as ProjectDetail);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId]);

  const project = detail?.project;
  const completed = detail?.renders?.find((render) => render.status === "completed" && render.output_storage_path);
  if (!projectId || !project || !completed || !["review", "completed"].includes(project.status)) return null;

  return (
    <section style={{ width: "min(calc(100% - 32px), 1480px)", margin: "0 auto 24px" }} aria-label="Download reviewed master">
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        border: "1px solid rgba(72,199,142,.28)",
        borderRadius: 20,
        background: "linear-gradient(135deg,rgba(72,199,142,.09),rgba(8,16,24,.98) 46%)",
        padding: 18,
        color: "#f7fafc"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center", background: "rgba(72,199,142,.1)", color: "#75dfb0", border: "1px solid rgba(72,199,142,.2)", flex: "0 0 auto" }}>
            {loading ? <Loader2 size={19} /> : <Film size={19} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".16em", textTransform: "uppercase", color: "#75dfb0" }}>Review master ready</div>
            <div style={{ marginTop: 3, fontSize: 17, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.title}</div>
            <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.45, color: "#8296a3" }}>Private MP4 · the download link is generated only when you tap it.</div>
          </div>
        </div>
        <a
          href={`/api/admin/video-producer/projects/${project.id}/download`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            minHeight: 46,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
            borderRadius: 13,
            padding: "0 18px",
            background: "#f5f8fa",
            color: "#071018",
            textDecoration: "none",
            fontSize: 11,
            fontWeight: 950,
            letterSpacing: ".09em",
            whiteSpace: "nowrap"
          }}
        >
          <Download size={16} /> DOWNLOAD MASTER
        </a>
      </div>
    </section>
  );
}

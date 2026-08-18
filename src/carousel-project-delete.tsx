"use client";

import { createPortal } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ProjectPayload = { project?: { id: string; title: string; status: string }; error?: string };

export function CarouselProjectDelete() {
  const router = useRouter();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [project, setProject] = useState<ProjectPayload["project"]>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const projectId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("project") || "";
  }, []);

  useEffect(() => {
    let disposed = false;
    const sync = () => {
      if (disposed) return;
      const next = document.querySelector<HTMLElement>(".carousel-studio-master .creative-head-actions");
      setTarget((current) => current === next ? current : next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/admin/creative-projects/${projectId}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as ProjectPayload;
        if (!response.ok || !data.project) throw new Error(data.error || "Creative Project could not be loaded.");
        if (!cancelled) setProject(data.project);
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Delete action could not be loaded."); });
    return () => { cancelled = true; };
  }, [projectId]);

  async function removeProject() {
    if (!projectId || !project || project.status !== "draft") return;
    if (!window.confirm(`Delete draft “${project.title}”? This permanently removes the editable draft and its revision history.`)) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/creative-projects/${projectId}/delete`, { method: "DELETE" });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Draft could not be deleted.");
      router.replace("/admin/carousel-studio?view=library");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Draft could not be deleted.");
    } finally {
      setWorking(false);
    }
  }

  if (!target || project?.status !== "draft") return null;

  return createPortal(<>
    <button type="button" className="creative-secondary carousel-project-delete" disabled={working} onClick={() => void removeProject()}>{working ? <Loader2 size={15} className="spin"/> : <Trash2 size={15}/>} Delete</button>
    {error ? <span className="carousel-project-delete-error" role="status">{error}</span> : null}
  </>, target);
}

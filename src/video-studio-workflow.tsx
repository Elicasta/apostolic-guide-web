"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { PathwayAssetLibrary } from "@/pathway-asset-library";

const STEPS = [
  ["Pathway", "Source + readiness"],
  ["Direct", "Sol + audio timing"],
  ["Edit", "Visual beats"],
  ["Render", "Create MP4s"],
  ["Review", "QC + assets"]
] as const;

function readPathway() {
  const select = document.querySelector<HTMLSelectElement>(".video-studio-sourcebar select");
  return {
    slug: select?.value || "",
    title: select?.selectedOptions?.[0]?.textContent?.replace(/\s·\sno audio$/, "")?.trim() || "Pathway"
  };
}

export function VideoStudioWorkflow({ aiReady }: { aiReady: boolean }) {
  const [page, setPage] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState(0);
  const [pathwaySlug, setPathwaySlug] = useState("");
  const [pathwayTitle, setPathwayTitle] = useState("Pathway");
  const [syncing, setSyncing] = useState(false);
  const [syncNonce, setSyncNonce] = useState(0);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".video-studio-page");
    setPage(root);
    if (!root) return;
    const sync = () => {
      const pathway = readPathway();
      setPathwaySlug(pathway.slug);
      setPathwayTitle(pathway.title);
    };
    sync();
    document.addEventListener("change", sync, true);
    return () => document.removeEventListener("change", sync, true);
  }, []);

  useEffect(() => {
    if (!page) return;
    page.dataset.workflowStage = String(stage);
  }, [page, stage]);

  useEffect(() => {
    if (stage !== 4 || !pathwaySlug) return;
    let cancelled = false;
    const run = async () => {
      setSyncing(true);
      try {
        await fetch("/api/admin/pathway-assets/sync-video", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pathwaySlug })
        });
        if (!cancelled) setSyncNonce((value) => value + 1);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [stage, pathwaySlug]);

  if (!page) return null;

  const nav = createPortal(<nav className="video-workflow-nav" aria-label="Video Studio workflow">{STEPS.map(([label, description], index) => <button type="button" key={label} className={stage === index ? "is-active" : ""} onClick={() => setStage(index)}><i>{index + 1}</i><span><strong>{label}</strong><span>{description}</span></span></button>)}</nav>, page);
  const extras = createPortal(<>
    {stage === 4 ? <>
      {syncing ? <div className="admin-notice video-workflow-sync"><Loader2 size={15} className="spin"/> Indexing Video Studio project, renders, and thumbnail into the Pathway folder…</div> : null}
      <PathwayAssetLibrary key={`${pathwaySlug}:${syncNonce}`} pathwaySlug={pathwaySlug} pathwayTitle={pathwayTitle} studio="video" aiReady={aiReady}/>
    </> : null}
    <div className="video-workflow-footer">
      <button type="button" className="button" disabled={stage === 0} onClick={() => setStage((value) => Math.max(0, value - 1))}><ChevronLeft size={15}/> Back</button>
      <button type="button" className="button primary" disabled={stage === STEPS.length - 1} onClick={() => setStage((value) => Math.min(STEPS.length - 1, value + 1))}>Next <ChevronRight size={15}/></button>
    </div>
  </>, page);
  return <>{nav}{extras}</>;
}

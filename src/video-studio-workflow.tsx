"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Film, FolderOpen, Loader2, Settings2, Youtube } from "lucide-react";
import { PathwayAssetLibrary } from "@/pathway-asset-library";

const STEPS = [
  ["Pathway", "Source + readiness"],
  ["Direct", "Sol + audio timing"],
  ["Edit", "Visual beats"],
  ["Render", "Create MP4s"],
  ["Review", "QC + handoff"]
] as const;

type ReviewPanel = "video" | "publishing" | "assets";

type PathwayContext = {
  slug: string;
  title: string;
  statuses: string[];
};

function readPathway(): PathwayContext {
  const select = document.querySelector<HTMLSelectElement>(".video-studio-sourcebar select");
  const statuses = [...document.querySelectorAll<HTMLElement>(".video-studio-sourcebar .video-source-status strong")]
    .map((item) => item.textContent?.trim() || "")
    .filter(Boolean);
  return {
    slug: select?.value || "",
    title: select?.selectedOptions?.[0]?.textContent?.replace(/\s·\sno audio$/, "")?.trim() || "Pathway",
    statuses
  };
}

function sameStatuses(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function VideoStudioWorkflow({ aiReady }: { aiReady: boolean }) {
  const [page, setPage] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState(0);
  const [reviewPanel, setReviewPanel] = useState<ReviewPanel>("video");
  const [showAllPublishing, setShowAllPublishing] = useState(false);
  const [pathwaySlug, setPathwaySlug] = useState("");
  const [pathwayTitle, setPathwayTitle] = useState("Pathway");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncNonce, setSyncNonce] = useState(0);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".video-studio-page");
    setPage(root);
    if (!root) return;
    const sync = () => {
      const pathway = readPathway();
      setPathwaySlug((current) => current === pathway.slug ? current : pathway.slug);
      setPathwayTitle((current) => current === pathway.title ? current : pathway.title);
      setStatuses((current) => sameStatuses(current, pathway.statuses) ? current : pathway.statuses);
    };
    sync();
    document.addEventListener("change", sync, true);
    const observer = new MutationObserver(sync);
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
      document.removeEventListener("change", sync, true);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!page) return;
    page.dataset.workflowStage = String(stage);
    page.dataset.reviewPanel = stage === 4 ? reviewPanel : "";
    page.dataset.publishingDetail = showAllPublishing ? "all" : "essential";
  }, [page, stage, reviewPanel, showAllPublishing]);

  useEffect(() => {
    if (stage !== 4) {
      setReviewPanel("video");
      setShowAllPublishing(false);
    }
  }, [stage]);

  useEffect(() => {
    if (stage !== 4 || reviewPanel !== "assets" || !pathwaySlug) return;
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
  }, [stage, reviewPanel, pathwaySlug]);

  if (!page) return null;

  const nav = createPortal(<>
    <nav className="video-workflow-nav video-workflow-nav-v2" aria-label="Video Studio workflow">
      {STEPS.map(([label, description], index) => <button type="button" key={label} className={stage === index ? "is-active" : ""} onClick={() => setStage(index)}>
        <i>{index + 1}</i>
        <span><strong>{label}</strong><span>{description}</span></span>
      </button>)}
    </nav>
    {stage > 0 && stage < 4 ? <div className="video-workflow-context" aria-label="Current video project">
      <div><span>Current project</span><strong>{pathwayTitle}</strong></div>
      <p>{statuses.length ? statuses.join(" · ") : "Project state saved across every stage."}</p>
    </div> : null}
    {stage === 4 ? <section className="video-review-switcher" aria-label="Review workspace">
      <div className="video-review-switcher-copy">
        <span>Final handoff</span>
        <strong>{pathwayTitle}</strong>
      </div>
      <div className="video-review-tabs" role="tablist" aria-label="Review panels">
        <button type="button" role="tab" aria-selected={reviewPanel === "video"} className={reviewPanel === "video" ? "is-active" : ""} onClick={() => setReviewPanel("video")}><Film size={15}/> Video</button>
        <button type="button" role="tab" aria-selected={reviewPanel === "publishing"} className={reviewPanel === "publishing" ? "is-active" : ""} onClick={() => setReviewPanel("publishing")}><Youtube size={15}/> Publishing</button>
        <button type="button" role="tab" aria-selected={reviewPanel === "assets"} className={reviewPanel === "assets" ? "is-active" : ""} onClick={() => setReviewPanel("assets")}><FolderOpen size={15}/> Assets</button>
      </div>
      {reviewPanel === "publishing" ? <button type="button" className={showAllPublishing ? "video-review-more is-active" : "video-review-more"} onClick={() => setShowAllPublishing((value) => !value)}><Settings2 size={14}/> {showAllPublishing ? "Essentials only" : "More metadata"}</button> : null}
    </section> : null}
  </>, page);

  const extras = createPortal(<>
    {stage === 4 && reviewPanel === "assets" ? <>
      {syncing ? <div className="admin-notice video-workflow-sync"><Loader2 size={15} className="spin"/> Indexing this Video Studio project into the Pathway library…</div> : null}
      <PathwayAssetLibrary key={`${pathwaySlug}:${syncNonce}`} pathwaySlug={pathwaySlug} pathwayTitle={pathwayTitle} studio="video" aiReady={aiReady}/>
    </> : null}
    {stage < 4 ? <div className="video-workflow-footer">
      <button type="button" className="button" disabled={stage === 0} onClick={() => setStage((value) => Math.max(0, value - 1))}><ChevronLeft size={15}/> Back</button>
      <button type="button" className="button primary" onClick={() => setStage((value) => Math.min(STEPS.length - 1, value + 1))}>Next <ChevronRight size={15}/></button>
    </div> : null}
  </>, page);
  return <>{nav}{extras}</>;
}

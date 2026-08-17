"use client";

import { Captions, Eye, FileClock, Palette, Send } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

type CarouselStage = "design" | "captions" | "preview" | "publish";

const STAGES: Array<{ id: CarouselStage; label: string; description: string; icon: typeof Palette }> = [
  { id: "design", label: "Design", description: "Layout · slides · art direction", icon: Palette },
  { id: "captions", label: "Captions", description: "Slide copy · alt text · unified caption", icon: Captions },
  { id: "preview", label: "Preview", description: "See the finished post before handoff", icon: Eye },
  { id: "publish", label: "Publish", description: "Prepare · ready · open Publishing", icon: Send }
];

function storageKey(projectId: string) {
  return `apostolic-guide:carousel-stage:${projectId}`;
}

function actionButton(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>(".carousel-studio-master .creative-head-actions button")]
    .find((button) => button.textContent?.trim().toLowerCase().includes(label.toLowerCase())) ?? null;
}

function currentFormatLabel() {
  const strong = document.querySelector<HTMLElement>(".carousel-studio-master .creative-context-bar span:nth-child(3) strong")?.textContent?.trim().toLowerCase() || "carousel";
  if (strong.includes("story")) return { destination: "Instagram Story", ratio: "9:16" };
  if (strong.includes("single")) return { destination: "Instagram Post", ratio: "4:5" };
  return { destination: "Instagram Carousel", ratio: "4:5" };
}

export function CarouselWorkflowStages({ projectId }: { projectId?: string | null }) {
  const [target, setTarget] = useState<Element | null>(null);
  const [stage, setStage] = useState<CarouselStage>("design");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [format, setFormat] = useState({ destination: "Instagram Carousel", ratio: "4:5" });

  useEffect(() => {
    if (!projectId) {
      setTarget(null);
      return;
    }

    const stored = window.sessionStorage.getItem(storageKey(projectId));
    if (stored === "design" || stored === "captions" || stored === "preview" || stored === "publish") setStage(stored);

    const sync = () => {
      const shell = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
      const context = shell?.querySelector(".creative-context-bar") ?? null;
      if (shell) {
        shell.dataset.carouselStage = stage;
        shell.dataset.carouselHistory = historyOpen ? "open" : "closed";
      }
      const publish = actionButton("Publish");
      setCanPublish(Boolean(publish && !publish.disabled));
      setFormat(currentFormatLabel());
      setTarget((current) => current === context ? current : context);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "class"] });
    return () => observer.disconnect();
  }, [historyOpen, projectId, stage]);

  useEffect(() => {
    if (!projectId) return;
    window.sessionStorage.setItem(storageKey(projectId), stage);
    const shell = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
    if (shell) shell.dataset.carouselStage = stage;
  }, [projectId, stage]);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
    if (shell) shell.dataset.carouselHistory = historyOpen ? "open" : "closed";
  }, [historyOpen]);

  const current = useMemo(() => STAGES.find((item) => item.id === stage) ?? STAGES[0], [stage]);

  function prepareForPublishing() {
    actionButton("Ready")?.click();
  }

  function openPublishing() {
    actionButton("Publish")?.click();
  }

  if (!target || !projectId) return null;

  return createPortal(
    <div className="carousel-workflow" aria-label="Carousel Studio workflow">
      <div className="carousel-workflow-steps" role="tablist" aria-label="Creative workflow stages">
        {STAGES.map((item, index) => {
          const Icon = item.icon;
          const active = item.id === stage;
          return <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "is-active" : ""}
            onClick={() => setStage(item.id)}
          >
            <span className="carousel-workflow-number">{index + 1}</span>
            <Icon size={16}/>
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
          </button>;
        })}
      </div>
      <div className="carousel-workflow-current">
        <span><strong>{current.label}</strong><small>{current.description}</small></span>
        {stage === "preview" ? <div className="carousel-preview-destination"><Eye size={15}/><span><b>{format.destination}</b><small>{format.ratio} · review every slide and the final caption</small></span><button type="button" onClick={() => setStage("publish")}>Continue to Publish</button></div> : null}
        {stage === "publish" ? <div className="carousel-handoff-actions"><span><b>Final handoff</b><small>Prepare renders the finished assets and marks the project Ready.</small></span><button type="button" onClick={prepareForPublishing}>Prepare</button><button type="button" className="is-primary" disabled={!canPublish} onClick={openPublishing}>Open Publishing</button></div> : null}
        <button type="button" className={historyOpen ? "is-active" : ""} onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen}>
          <FileClock size={15}/> Versions
        </button>
      </div>
    </div>,
    target
  );
}

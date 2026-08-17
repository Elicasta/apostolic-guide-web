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

function stageTarget(stage: CarouselStage) {
  if (stage === "captions") return ".creative-caption-card";
  if (stage === "preview") return ".creative-frame-rail";
  if (stage === "publish") return ".carousel-workflow-current";
  return ".creative-frame-rail";
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
      setStage("design");
      return;
    }

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

  const current = useMemo(() => STAGES.find((item) => item.id === stage) ?? STAGES[0], [stage]);

  function goToStage(next: CarouselStage) {
    if (next === stage) return;
    setStage(next);
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(`.carousel-studio-master ${stageTarget(next)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function prepareForPublishing() {
    actionButton("Ready")?.click();
  }

  function openPublishing() {
    actionButton("Publish")?.click();
  }

  function publishShortcut() {
    if (canPublish) {
      openPublishing();
      return;
    }
    goToStage("publish");
  }

  if (!target || !projectId) return null;

  return createPortal(
    <div className="carousel-workflow" aria-label="Carousel Studio workflow">
      <label className="carousel-workflow-mobile">
        <span>Workflow</span>
        <select value={stage} onChange={(event) => goToStage(event.target.value as CarouselStage)} aria-label="Carousel workflow stage">
          {STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
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
            onClick={() => goToStage(item.id)}
          >
            <span className="carousel-workflow-number">{index + 1}</span>
            <Icon size={16}/>
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
          </button>;
        })}
      </div>
      <div className="carousel-workflow-current">
        <span><strong>{current.label}</strong><small>{current.description}</small></span>
        {stage === "preview" ? <div className="carousel-preview-destination"><Eye size={15}/><span><b>{format.destination}</b><small>{format.ratio} · review every slide and the final caption</small></span><button type="button" onClick={() => goToStage("publish")}>Continue to Publish</button></div> : null}
        {stage === "publish" ? <div className="carousel-handoff-actions"><span><b>Final handoff</b><small>Prepare renders the finished assets and marks the project Ready.</small></span><button type="button" onClick={prepareForPublishing}>Prepare</button><button type="button" className="is-primary" disabled={!canPublish} onClick={openPublishing}>Open Publishing</button></div> : null}
        <button type="button" className="carousel-publish-shortcut" onClick={publishShortcut}><Send size={15}/> Publish</button>
        <button type="button" className={historyOpen ? "is-active" : ""} onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen}>
          <FileClock size={15}/> Versions
        </button>
      </div>
    </div>,
    target
  );
}

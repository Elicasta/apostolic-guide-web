"use client";

import { Captions, FileClock, Palette, Send } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

type CarouselStage = "design" | "captions" | "publish";

const STAGES: Array<{ id: CarouselStage; label: string; description: string; icon: typeof Palette }> = [
  { id: "design", label: "Design", description: "Layout · slides · art direction", icon: Palette },
  { id: "captions", label: "Captions", description: "Slide copy · alt text · unified caption", icon: Captions },
  { id: "publish", label: "Publish", description: "Render · ready · send", icon: Send }
];

function storageKey(projectId: string) {
  return `apostolic-guide:carousel-stage:${projectId}`;
}

export function CarouselWorkflowStages({ projectId }: { projectId?: string | null }) {
  const [target, setTarget] = useState<Element | null>(null);
  const [stage, setStage] = useState<CarouselStage>("design");
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setTarget(null);
      return;
    }

    const stored = window.sessionStorage.getItem(storageKey(projectId));
    if (stored === "design" || stored === "captions" || stored === "publish") setStage(stored);

    const sync = () => {
      const shell = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
      const context = shell?.querySelector(".creative-context-bar") ?? null;
      if (shell) {
        shell.dataset.carouselStage = stage;
        shell.dataset.carouselHistory = historyOpen ? "open" : "closed";
      }
      setTarget((current) => current === context ? current : context);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
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
        <button type="button" className={historyOpen ? "is-active" : ""} onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen}>
          <FileClock size={15}/> Versions
        </button>
      </div>
    </div>,
    target
  );
}

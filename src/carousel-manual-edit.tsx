"use client";

import { createPortal } from "react-dom";
import { Check, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

export function CarouselManualEdit() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [slideLabel, setSlideLabel] = useState("Slide 1");

  useEffect(() => {
    const master = document.querySelector<HTMLElement>(".carousel-studio-master");
    if (!master) return;

    let currentRoot: HTMLElement | null = null;
    let slideObserver: MutationObserver | null = null;

    const bindProject = () => {
      const nextRoot = master.querySelector<HTMLElement>(".creative-studio-shell");
      const nextTarget = nextRoot?.querySelector<HTMLElement>(".creative-head-actions") ?? null;
      if (!nextRoot || !nextTarget) return;

      setRoot(nextRoot);
      setTarget(nextTarget);

      if (currentRoot === nextRoot) return;
      slideObserver?.disconnect();
      currentRoot = nextRoot;

      const syncSlide = () => {
        const rows = [...nextRoot.querySelectorAll<HTMLElement>(".creative-frame-row")];
        const index = rows.findIndex((row) => row.classList.contains("is-active"));
        const total = rows.length;
        const preview = nextRoot.querySelector<HTMLElement>(".creative-frame-preview");
        const noun = preview?.classList.contains("is-story") ? "Frame" : preview?.classList.contains("is-single") ? "Post" : "Slide";
        setSlideLabel(`${noun} ${Math.max(0, index) + 1}${total > 1 ? ` of ${total}` : ""}`);
      };

      syncSlide();
      slideObserver = new MutationObserver(syncSlide);
      slideObserver.observe(nextRoot, { subtree: true, attributes: true, attributeFilter: ["class"] });
    };

    bindProject();
    const projectObserver = new MutationObserver(bindProject);
    projectObserver.observe(master, { childList: true, subtree: true });

    return () => {
      if (currentRoot) delete currentRoot.dataset.manualEdit;
      slideObserver?.disconnect();
      projectObserver.disconnect();
    };
  }, []);

  function toggleManualEdit() {
    if (!root) return;
    const next = !open;
    setOpen(next);
    if (next) root.dataset.manualEdit = "open";
    else delete root.dataset.manualEdit;

    window.setTimeout(() => {
      const destination = next
        ? root.querySelector<HTMLElement>(".carousel-manual-design-controls") || root.querySelector<HTMLElement>(".creative-editor-panel")
        : root.querySelector<HTMLElement>(".creative-preview-panel");
      destination?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  if (!target) return null;

  return createPortal(
    <button type="button" className={`carousel-manual-edit-toggle ${open ? "is-open" : ""}`} onClick={toggleManualEdit} aria-pressed={open}>
      {open ? <Check size={16}/> : <SlidersHorizontal size={16}/>}
      <span><strong>{open ? "Done Editing" : "Manual Edit"}</strong><small>{open ? `${slideLabel} · preview pinned` : "Edit while keeping preview visible"}</small></span>
    </button>,
    target
  );
}

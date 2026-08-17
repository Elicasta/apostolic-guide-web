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
    const current = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
    if (!current) return;
    setRoot(current);
    setTarget(current.querySelector<HTMLElement>(".creative-context-bar"));

    const syncSlide = () => {
      const rows = [...current.querySelectorAll<HTMLElement>(".creative-frame-row")];
      const index = rows.findIndex((row) => row.classList.contains("is-active"));
      const total = rows.length;
      setSlideLabel(`${current.querySelector(".creative-frame-preview.is-story") ? "Frame" : "Slide"} ${Math.max(0, index) + 1}${total ? ` of ${total}` : ""}`);
    };

    syncSlide();
    const observer = new MutationObserver(syncSlide);
    observer.observe(current, { subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      delete current.dataset.manualEdit;
      observer.disconnect();
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
        ? root.querySelector<HTMLElement>(".creative-editor-panel")
        : root.querySelector<HTMLElement>(".creative-preview-panel");
      destination?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  if (!target) return null;

  return createPortal(
    <button type="button" className={`carousel-manual-edit-toggle ${open ? "is-open" : ""}`} onClick={toggleManualEdit} aria-pressed={open}>
      {open ? <Check size={16}/> : <SlidersHorizontal size={16}/>}
      <span><strong>{open ? "Done Editing" : "Manual Edit"}</strong><small>{open ? `${slideLabel} · autosaving` : "Edit one slide at a time"}</small></span>
    </button>,
    target
  );
}

"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

const SECTIONS = [
  ["structure", "Structure", "Structure"],
  ["caption", "Unified Caption", "Caption"],
  ["settings", "Project Settings", "Settings"],
  ["versions", "Version History", "Versions"]
] as const;

type FocusKey = (typeof SECTIONS)[number][0];

function compactText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function findSection(root: HTMLElement, heading: string) {
  return [...root.querySelectorAll<HTMLElement>(".creative-card")].find((card) => {
    const title = card.querySelector<HTMLElement>(".creative-panel-head strong, h2, h3, strong");
    return compactText(title?.textContent).includes(heading);
  }) || null;
}

export function CarouselStudioMobileFocus() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [focus, setFocus] = useState<FocusKey>("structure");
  const [available, setAvailable] = useState<FocusKey[]>(SECTIONS.map(([key]) => key));

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("carousel-mobile-focus") as FocusKey | null;
      if (saved && SECTIONS.some(([key]) => key === saved)) setFocus(saved);
    } catch {}

    let observer: MutationObserver | null = null;
    const bind = () => {
      const nextRoot = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
      if (!nextRoot) return false;

      const single = Boolean(nextRoot.querySelector(".creative-frame-preview.is-single"));
      let firstCard: HTMLElement | null = null;
      const nextAvailable: FocusKey[] = [];

      for (const [key, heading] of SECTIONS) {
        const card = findSection(nextRoot, heading);
        if (!card) continue;

        if (key === "structure" && single) {
          card.hidden = true;
          delete card.dataset.carouselFocusSection;
          continue;
        }

        card.hidden = false;
        card.dataset.carouselFocusSection = key;
        firstCard ||= card;
        nextAvailable.push(key);
      }

      if (!firstCard || nextAvailable.length < 2) return false;

      let mount = nextRoot.querySelector<HTMLElement>("[data-carousel-focus-nav-host]");
      if (!mount) {
        mount = document.createElement("div");
        mount.dataset.carouselFocusNavHost = "true";
        firstCard.before(mount);
      }

      setRoot(nextRoot);
      setHost(mount);
      setAvailable(nextAvailable);
      setFocus((current) => nextAvailable.includes(current) ? current : nextAvailable[0]);
      return true;
    };

    bind();
    observer = new MutationObserver(() => bind());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    if (!root || !available.includes(focus)) return;
    root.dataset.carouselFocus = focus;
    try { window.localStorage.setItem("carousel-mobile-focus", focus); } catch {}
  }, [available, focus, root]);

  if (!host) return null;

  return createPortal(
    <nav className="carousel-focus-nav" aria-label="Carousel editing sections" style={{ gridTemplateColumns: `repeat(${Math.max(1, available.length)}, minmax(0,1fr))` }}>
      {SECTIONS.filter(([key]) => available.includes(key)).map(([key, , label]) => <button
        key={key}
        type="button"
        className={focus === key ? "is-active" : ""}
        aria-pressed={focus === key}
        onClick={() => setFocus(key)}
      >{label}</button>)}
    </nav>,
    host
  );
}

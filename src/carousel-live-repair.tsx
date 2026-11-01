"use client";

import { useEffect } from "react";

function readNumber(input: HTMLInputElement | undefined, fallback: number) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function applyManualState() {
  const root = document.querySelector<HTMLElement>(".carousel-studio-master .creative-studio-shell");
  const panel = root?.querySelector<HTMLElement>(".carousel-inline-manual-panel");
  const board = root?.querySelector<HTMLElement>(".creative-preview-panel .persistent-carousel-artboard");
  const artwork = board?.querySelector<HTMLElement>(".carousel-artwork");
  const copy = board?.querySelector<HTMLElement>(".carousel-copy");
  if (!root || !panel || !board || !artwork || !copy) return;

  const ranges = [...panel.querySelectorAll<HTMLInputElement>('input[type="range"]')];
  const selects = [...panel.querySelectorAll<HTMLSelectElement>("select")];
  const alignment = (selects.find((select) => ["left", "center", "right"].includes(select.value))?.value || "center") as "left" | "center" | "right";
  const copyY = readNumber(ranges[0], 50);
  const headlineScale = readNumber(ranges[1], 1) / (Number(ranges[1]?.max || 1.45) <= 2 ? 1 : 100);
  const titleWidth = readNumber(ranges[2], 90);
  const bodyScale = readNumber(ranges[3], 1) / (Number(ranges[3]?.max || 1.35) <= 2 ? 1 : 100);
  const bodyWidth = readNumber(ranges[4], 76);
  const copyGapRaw = readNumber(ranges[5], 2.4);
  const copyGap = Number(ranges[5]?.max || 5) > 10 ? copyGapRaw / 10 : copyGapRaw;

  artwork.style.setProperty("--copy-y", `${copyY}%`);
  artwork.style.setProperty("--headline-scale", String(headlineScale));
  artwork.style.setProperty("--title-width", `${titleWidth}%`);
  artwork.style.setProperty("--body-scale", String(bodyScale));
  artwork.style.setProperty("--body-width", `${bodyWidth}%`);
  artwork.style.setProperty("--copy-gap", `${copyGap}cqw`);
  artwork.style.setProperty("--copy-align", alignment);

  copy.style.textAlign = alignment;
  copy.style.alignItems = alignment === "center" ? "center" : alignment === "right" ? "flex-end" : "flex-start";
  copy.style.justifyItems = alignment;

  const headline = copy.querySelector<HTMLElement>("strong");
  if (headline) {
    headline.style.maxWidth = `${titleWidth}%`;
    headline.style.textAlign = alignment;
  }
  copy.querySelectorAll<HTMLElement>("p,em").forEach((node) => {
    node.style.maxWidth = `${bodyWidth}%`;
    node.style.textAlign = alignment;
  });
}

export function CarouselLiveRepair() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        applyManualState();
        window.setTimeout(applyManualState, 30);
        window.setTimeout(applyManualState, 100);
      });
    };

    const onInput = (event: Event) => {
      if ((event.target as Element | null)?.closest(".carousel-inline-manual")) schedule();
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("click", onInput, true);

    const master = document.querySelector<HTMLElement>(".carousel-studio-master");
    const observer = master ? new MutationObserver(schedule) : null;
    observer?.observe(master!, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-creative-template"] });
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      document.removeEventListener("click", onInput, true);
      observer?.disconnect();
    };
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";

function mutationInsideMirror(mutation: MutationRecord) {
  const target = mutation.target;
  const element = target instanceof Element ? target : target.parentElement;
  return Boolean(element?.closest("[data-carousel-selected-frame-mirror]"));
}

export function CarouselPreviewFrameSync() {
  useEffect(() => {
    const master = document.querySelector<HTMLElement>(".carousel-studio-master");
    if (!master) return;

    let frame = 0;
    let timer = 0;
    let lastSignature = "";
    let lastVisible: HTMLElement | null = null;

    const syncNow = () => {
      const root = master.querySelector<HTMLElement>(".creative-studio-shell");
      const visible = root?.querySelector<HTMLElement>(".creative-preview-panel .creative-frame-preview") ?? null;
      const rows = root ? [...root.querySelectorAll<HTMLButtonElement>(".creative-frame-row")] : [];
      const hidden = root ? [...root.querySelectorAll<HTMLElement>(".creative-render-stage > .creative-frame-preview")] : [];
      const activeIndex = rows.findIndex((row) => row.classList.contains("is-active"));
      const resolvedIndex = activeIndex >= 0 ? activeIndex : 0;
      const sourceBoard = hidden[resolvedIndex]?.querySelector<HTMLElement>(":scope > .persistent-carousel-artboard") ?? null;

      if (!visible || !sourceBoard) return;
      lastVisible = visible;

      const sourceSignature = `${resolvedIndex}|${sourceBoard.outerHTML}`;
      let mirror = visible.querySelector<HTMLElement>(":scope > [data-carousel-selected-frame-mirror]");
      if (!mirror) {
        mirror = document.createElement("div");
        mirror.dataset.carouselSelectedFrameMirror = "true";
        mirror.setAttribute("aria-hidden", "true");
        Object.assign(mirror.style, {
          position: "absolute",
          inset: "0",
          zIndex: "30",
          pointerEvents: "none",
          overflow: "hidden"
        });
        visible.appendChild(mirror);
      }

      if (!visible.dataset.carouselPreviewPositionOwned) {
        const currentPosition = window.getComputedStyle(visible).position;
        if (currentPosition === "static") {
          visible.style.position = "relative";
          visible.dataset.carouselPreviewPositionOwned = "true";
        }
      }

      const visibleBoards = [...visible.children].filter((child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains("persistent-carousel-artboard")
      );
      visibleBoards.forEach((board) => {
        board.style.visibility = "hidden";
        board.style.pointerEvents = "none";
      });

      if (lastSignature === sourceSignature && mirror.childElementCount) return;
      const clone = sourceBoard.cloneNode(true) as HTMLElement;
      clone.dataset.carouselSelectedFrameClone = "true";
      clone.style.visibility = "visible";
      clone.style.pointerEvents = "none";
      clone.style.width = "100%";
      clone.style.height = "100%";
      mirror.replaceChildren(clone);
      mirror.dataset.frameIndex = String(resolvedIndex);
      lastSignature = sourceSignature;
    };

    const schedule = (delay = 0) => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        frame = window.requestAnimationFrame(syncNow);
      }, delay);
    };

    const onSelection = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".creative-frame-row")) return;
      schedule(0);
      window.setTimeout(syncNow, 40);
      window.setTimeout(syncNow, 120);
    };

    document.addEventListener("click", onSelection, true);
    document.addEventListener("touchend", onSelection, true);
    document.addEventListener("input", schedule as unknown as EventListener, true);
    document.addEventListener("change", schedule as unknown as EventListener, true);

    const observer = new MutationObserver((mutations) => {
      if (mutations.every(mutationInsideMirror)) return;
      schedule(0);
    });
    observer.observe(master, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-creative-template"]
    });

    schedule(0);
    window.setTimeout(syncNow, 80);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("click", onSelection, true);
      document.removeEventListener("touchend", onSelection, true);
      document.removeEventListener("input", schedule as unknown as EventListener, true);
      document.removeEventListener("change", schedule as unknown as EventListener, true);
      const mirror = lastVisible?.querySelector<HTMLElement>(":scope > [data-carousel-selected-frame-mirror]");
      mirror?.remove();
      lastVisible?.querySelectorAll<HTMLElement>(":scope > .persistent-carousel-artboard").forEach((board) => {
        board.style.removeProperty("visibility");
        board.style.removeProperty("pointer-events");
      });
      if (lastVisible?.dataset.carouselPreviewPositionOwned) {
        lastVisible.style.removeProperty("position");
        delete lastVisible.dataset.carouselPreviewPositionOwned;
      }
    };
  }, []);

  return null;
}

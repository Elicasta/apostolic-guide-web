"use client";

import { useEffect } from "react";

type TouchStart = { row: HTMLButtonElement; x: number; y: number };

export function CarouselMobileInteractions() {
  useEffect(() => {
    const master = document.querySelector<HTMLElement>(".carousel-studio-master");
    if (!master) return;
    let start: TouchStart | null = null;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        start = null;
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const row = target?.closest<HTMLButtonElement>(".creative-frame-row") ?? null;
      if (!row) {
        start = null;
        return;
      }
      const touch = event.touches[0];
      start = { row, x: touch.clientX, y: touch.clientY };
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!start || event.changedTouches.length !== 1) {
        start = null;
        return;
      }
      const touch = event.changedTouches[0];
      const dx = Math.abs(touch.clientX - start.x);
      const dy = Math.abs(touch.clientY - start.y);
      const row = start.row;
      start = null;

      // Let a horizontal swipe keep scrolling the rail. A genuine tap is made
      // deterministic because iOS can otherwise cancel click inside an
      // overflow-x control after even tiny finger movement.
      if (dx > 10 || dy > 10 || row.disabled) return;
      event.preventDefault();
      row.click();
      row.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    };

    const onTouchCancel = () => { start = null; };
    master.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    master.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    master.addEventListener("touchcancel", onTouchCancel, { capture: true, passive: true });
    return () => {
      master.removeEventListener("touchstart", onTouchStart, true);
      master.removeEventListener("touchend", onTouchEnd, true);
      master.removeEventListener("touchcancel", onTouchCancel, true);
    };
  }, []);

  return null;
}

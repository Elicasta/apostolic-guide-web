"use client";

import { useEffect, useRef } from "react";

function signature() {
  const board = document.querySelector<HTMLElement>(".carousel-artboard");
  const slide = document.querySelector<HTMLElement>(".carousel-preview-nav strong")?.innerText?.trim() || "";
  return `${board?.className || ""}|${slide}`;
}

export function CarouselPreviewStability() {
  const last = useRef("");
  useEffect(() => {
    const timer = window.setInterval(() => {
      const board = document.querySelector<HTMLElement>(".carousel-artboard");
      if (!board) return;
      const next = signature();
      if (next === last.current) return;
      last.current = next;
      board.classList.add("is-stabilizing");
      window.setTimeout(() => board.classList.remove("is-stabilizing"), 110);
    }, 90);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}

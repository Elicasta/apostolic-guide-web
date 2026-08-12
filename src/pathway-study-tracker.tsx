"use client";

import { useEffect } from "react";
import { trackEvent } from "./analytics";

export function PathwayStudyTracker({ slug, stepCount }: { slug: string; stepCount: number }) {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-pathway-step]"));
    if (!elements.length) return;

    const completed = new Set<number>();
    const timers = new Map<number, number>();
    let pathwayCompletionSent = false;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const index = Number(element.dataset.pathwayStep);
        if (!Number.isInteger(index) || index < 0 || completed.has(index)) continue;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          if (timers.has(index)) continue;
          const timer = window.setTimeout(() => {
            completed.add(index);
            timers.delete(index);
            trackEvent("pathway_step_completed", {
              contentKey: slug,
              pathwaySlug: slug,
              stepIndex: index,
              stepNumber: index + 1,
              stepCount,
              reference: element.dataset.pathwayReference ?? null
            });
            if (!pathwayCompletionSent && index + 1 >= stepCount) {
              pathwayCompletionSent = true;
              trackEvent("pathway_completed", {
                contentKey: slug,
                pathwaySlug: slug,
                completionMethod: "reading",
                stepCount
              });
            }
            observer.unobserve(element);
          }, 1400);
          timers.set(index, timer);
        } else {
          const timer = timers.get(index);
          if (timer) window.clearTimeout(timer);
          timers.delete(index);
        }
      }
    }, { threshold: [0.55, 0.75] });

    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, [slug, stepCount]);

  return null;
}

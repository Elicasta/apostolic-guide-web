"use client";

import { useEffect } from "react";
import { trackEvent } from "./analytics";

export function PathwayStudyTracker({ slug, stepCount }: { slug: string; stepCount: number }) {
  useEffect(() => {
    const completed = new Set<number>();
    const timers = new Map<number, number>();
    const observed = new WeakSet<HTMLElement>();
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
            if (!pathwayCompletionSent && completed.size >= stepCount) {
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

    const observeSteps = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLElement>("[data-pathway-step]").forEach((element) => {
        if (observed.has(element)) return;
        observed.add(element);
        observer.observe(element);
      });
    };

    observeSteps();

    const mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches("[data-pathway-step]") && !observed.has(node)) {
            observed.add(node);
            observer.observe(node);
          }
          observeSteps(node);
        }
      }
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, [slug, stepCount]);

  return null;
}

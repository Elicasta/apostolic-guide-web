"use client";

import { useEffect } from "react";

export function SiteBehavior() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    const menu = document.querySelector<HTMLDetailsElement>(".mobile-menu");
    let lastY = window.scrollY;
    let ticking = false;

    const closeMenu = () => {
      if (menu?.open) menu.open = false;
    };

    const updateHeader = () => {
      const currentY = window.scrollY;
      const movingDown = currentY > lastY + 6;
      const movingUp = currentY < lastY - 6;

      if (header) {
        if (movingDown && currentY > 120) header.classList.add("site-header-hidden");
        if (movingUp || currentY < 48) header.classList.remove("site-header-hidden");
      }

      if (Math.abs(currentY - lastY) > 4) closeMenu();
      lastY = currentY;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateHeader);
        ticking = true;
      }
    };

    const onMenuClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("a")) closeMenu();
    };

    const onSearchPromptClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const prompt = target?.closest<HTMLElement>("[data-search-fill]");
      if (!prompt) return;

      const value = prompt.dataset.searchFill ?? "";
      const scope = prompt.closest("section, .search-page") ?? document;
      const input = scope.querySelector<HTMLInputElement>('input[name="q"]')
        ?? document.querySelector<HTMLInputElement>('input[name="q"]');

      if (!input) return;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus({ preventScroll: true });
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 }
    );

    const observeRevealItems = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-visible)").forEach((item) => observer.observe(item));
    };

    observeRevealItems();

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches("[data-reveal]:not(.is-visible)")) observer.observe(node);
          observeRevealItems(node);
        });
      });
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    menu?.addEventListener("click", onMenuClick);
    document.addEventListener("click", onSearchPromptClick);

    return () => {
      window.removeEventListener("scroll", onScroll);
      menu?.removeEventListener("click", onMenuClick);
      document.removeEventListener("click", onSearchPromptClick);
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return null;
}

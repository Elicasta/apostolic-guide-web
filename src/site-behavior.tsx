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

    const revealItems = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
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

    revealItems.forEach((item) => observer.observe(item));
    window.addEventListener("scroll", onScroll, { passive: true });
    menu?.addEventListener("click", onMenuClick);

    return () => {
      window.removeEventListener("scroll", onScroll);
      menu?.removeEventListener("click", onMenuClick);
      observer.disconnect();
    };
  }, []);

  return null;
}

"use client";

import { BookmarkCheck, RotateCcw, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type StoredProgress = {
  ratio: number;
  scrollY: number;
  title: string;
  updatedAt: number;
};

const READING_PREFIXES = ["/articles/", "/answers/", "/topics/", "/scripture/", "/pathways/"];
const MAX_AGE = 1000 * 60 * 60 * 24 * 90;

function isReadingPage(pathname: string) {
  return READING_PREFIXES.some((prefix) => pathname.startsWith(prefix) && pathname.length > prefix.length);
}

function storageKey(pathname: string) {
  return `apostolic-guide:reading:${pathname}`;
}

export function ReadingProgress() {
  const pathname = usePathname();
  const eligible = useMemo(() => isReadingPage(pathname), [pathname]);
  const [saved, setSaved] = useState<StoredProgress | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    setSaved(null);
    if (!eligible) return;

    const key = storageKey(pathname);
    let frame = 0;
    let lastSavedAt = 0;

    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredProgress;
        const fresh = Date.now() - parsed.updatedAt < MAX_AGE;
        if (fresh && parsed.ratio >= 0.08 && parsed.ratio < 0.96) {
          setSaved(parsed);
          const timer = window.setTimeout(() => {
            if (window.scrollY < 120) setVisible(true);
          }, 900);
          return () => window.clearTimeout(timer);
        }
        if (!fresh || parsed.ratio >= 0.96) window.localStorage.removeItem(key);
      }
    } catch {}

    const persist = () => {
      frame = 0;
      const now = Date.now();
      if (now - lastSavedAt < 700) return;
      lastSavedAt = now;

      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const ratio = Math.min(1, Math.max(0, window.scrollY / maxScroll));

      try {
        if (ratio >= 0.96) {
          window.localStorage.removeItem(key);
          return;
        }
        if (ratio < 0.02) return;
        const value: StoredProgress = {
          ratio,
          scrollY: window.scrollY,
          title: document.title.replace(/ \| Apostolic Guide$/, ""),
          updatedAt: now
        };
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(persist);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", persist);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persist);
      if (frame) window.cancelAnimationFrame(frame);
      persist();
    };
  }, [eligible, pathname]);

  const resume = () => {
    if (!saved) return;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const target = Math.min(maxScroll, Math.max(saved.scrollY, saved.ratio * maxScroll));
    setVisible(false);
    window.requestAnimationFrame(() => window.scrollTo({ top: target, behavior: "smooth" }));
  };

  const restart = () => {
    try { window.localStorage.removeItem(storageKey(pathname)); } catch {}
    setVisible(false);
    setSaved(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!eligible || !visible || !saved) return null;

  return (
    <aside className="reading-resume" aria-label="Resume reading">
      <BookmarkCheck size={20} aria-hidden />
      <div>
        <strong>Continue where you stopped</strong>
        <span>{Math.round(saved.ratio * 100)}% through {saved.title}</span>
      </div>
      <button type="button" className="reading-resume-primary" onClick={resume}>Resume</button>
      <button type="button" className="reading-resume-reset" onClick={restart} aria-label="Start this page over"><RotateCcw size={16} /></button>
      <button type="button" className="reading-resume-close" onClick={() => setVisible(false)} aria-label="Dismiss"><X size={17} /></button>
    </aside>
  );
}

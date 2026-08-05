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

type ReadingHistoryItem = {
  ratio: number;
  completed: boolean;
  title: string;
  updatedAt: number;
};

type ReadingHistory = Record<string, ReadingHistoryItem>;

const READING_PREFIXES = ["/articles/", "/answers/", "/topics/", "/scripture/", "/pathways/"];
const HISTORY_KEY = "apostolic-guide:reading-history:v1";
const MAX_AGE = 1000 * 60 * 60 * 24 * 90;
const MAX_HISTORY_ITEMS = 60;

function isReadingPage(pathname: string) {
  return READING_PREFIXES.some((prefix) => pathname.startsWith(prefix) && pathname.length > prefix.length);
}

function storageKey(pathname: string) {
  return `apostolic-guide:reading:${pathname}`;
}

function pageTitle() {
  return document.title.replace(/ \| Apostolic Guide$/, "");
}

function readHistory(): ReadingHistory {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? parsed as ReadingHistory : {};
  } catch {
    return {};
  }
}

function recordHistory(pathname: string, ratio: number, title: string, updatedAt = Date.now()) {
  try {
    const history = readHistory();
    history[pathname] = {
      ratio: Math.min(1, Math.max(history[pathname]?.ratio ?? 0, ratio)),
      completed: ratio >= 0.94 || Boolean(history[pathname]?.completed),
      title,
      updatedAt
    };

    const trimmed = Object.fromEntries(
      Object.entries(history)
        .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_HISTORY_ITEMS)
    );

    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent("apostolic-guide:reading-history"));
  } catch {}
}

function clearHistoryItem(pathname: string) {
  try {
    const history = readHistory();
    delete history[pathname];
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    window.dispatchEvent(new CustomEvent("apostolic-guide:reading-history"));
  } catch {}
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
    let revealTimer = 0;
    let engagementTimer = 0;
    let lastSavedAt = 0;

    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredProgress;
        const fresh = Date.now() - parsed.updatedAt < MAX_AGE;
        if (fresh && parsed.ratio >= 0.08 && parsed.ratio < 0.96) {
          setSaved(parsed);
          revealTimer = window.setTimeout(() => {
            if (window.scrollY < 120) setVisible(true);
          }, 900);
        } else if (!fresh || parsed.ratio >= 0.96) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {}

    engagementTimer = window.setTimeout(() => {
      recordHistory(pathname, 0.03, pageTitle());
    }, 8000);

    const persist = () => {
      frame = 0;
      const now = Date.now();
      if (now - lastSavedAt < 700) return;
      lastSavedAt = now;

      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const ratio = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      const title = pageTitle();

      try {
        if (ratio >= 0.96) {
          recordHistory(pathname, 1, title, now);
          window.localStorage.removeItem(key);
          return;
        }
        if (ratio < 0.02) return;
        const value: StoredProgress = {
          ratio,
          scrollY: window.scrollY,
          title,
          updatedAt: now
        };
        window.localStorage.setItem(key, JSON.stringify(value));
        recordHistory(pathname, ratio, title, now);
      } catch {}
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(persist);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", persist);

    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(engagementTimer);
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
    clearHistoryItem(pathname);
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

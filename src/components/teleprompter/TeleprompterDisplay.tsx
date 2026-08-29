"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import SlideContent from "./SlideContent";
import {
  parseTeleprompterDocument,
  summarizeSlides,
} from "@/lib/teleprompter/parser";
import {
  makeSessionCode,
  normalizeSessionCode,
} from "@/lib/teleprompter/realtime";
import {
  loadTeleprompterDocuments,
  selectTeleprompterDocument,
  setLastPresentedDocumentId,
} from "@/lib/teleprompter/storage";
import { useTeleprompterSessionSync } from "@/lib/teleprompter/use-session-sync";
import type {
  TeleprompterDocument,
  TeleprompterSessionState,
} from "@/lib/teleprompter/types";

interface PointerStart {
  x: number;
  y: number;
}

export default function TeleprompterDisplay() {
  const [documents, setDocuments] = useState<TeleprompterDocument[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [chromeVisible, setChromeVisible] = useState(true);
  const [controllerUrl, setControllerUrl] = useState("");
  const pointerStartRef = useRef<PointerStart | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loaded = loadTeleprompterDocuments();
    const params = new URLSearchParams(window.location.search);
    const selected = selectTeleprompterDocument(loaded, params.get("doc"));
    const nextSession =
      normalizeSessionCode(params.get("session")) || makeSessionCode();

    setDocuments(loaded);
    setDocumentId(selected?.id ?? "");
    if (selected?.id) setLastPresentedDocumentId(selected.id);
    setSessionCode(nextSession);

    params.set("session", nextSession);
    if (selected?.id) params.set("doc", selected.id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
    setControllerUrl(
      `${window.location.origin}/teleprompter/control?session=${nextSession}`,
    );
  }, []);

  const selectedDocument = useMemo(
    () => documents.find((item) => item.id === documentId) ?? documents[0],
    [documents, documentId],
  );
  const slides = useMemo(
    () => parseTeleprompterDocument(selectedDocument?.content ?? ""),
    [selectedDocument?.content],
  );

  const deckState = useMemo<TeleprompterSessionState | null>(() => {
    if (!selectedDocument || slides.length === 0) return null;
    return {
      title: selectedDocument.title,
      documentId: selectedDocument.id,
      slideIndex: 0,
      theme: "night",
      mode: "script",
      fontScale: 1,
      locked: false,
      slides: summarizeSlides(slides),
      sequence: 0,
      updatedAt: 0,
      actorId: "display:init",
    };
  }, [selectedDocument, slides]);

  const { state, connection, dispatch } = useTeleprompterSessionSync({
    sessionCode,
    role: "display",
    initialState: deckState,
    canonicalDeck: deckState,
  });

  const slideIndex = state?.slideIndex ?? 0;
  const theme = state?.theme ?? "night";
  const fontScale = state?.fontScale ?? 1;
  const locked = state?.locked ?? false;
  const slide = slides[Math.min(slideIndex, Math.max(slides.length - 1, 0))];
  const night = theme === "night";

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [slideIndex]);

  const next = useCallback(() => dispatch({ type: "next" }), [dispatch]);
  const prev = useCallback(() => dispatch({ type: "prev" }), [dispatch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "c") {
        setChromeVisible((visible) => !visible);
        return;
      }
      if (event.key.toLowerCase() === "f") {
        void window.document.documentElement.requestFullscreen?.();
        return;
      }
      if (locked) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        prev();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locked, next, prev]);

  const copyController = async () => {
    if (controllerUrl) await navigator.clipboard?.writeText(controllerUrl);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || locked) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) >= 90 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35) {
      if (deltaX < 0) next();
      else prev();
    }
  };

  if (!selectedDocument || !slide || !state) return null;

  const sectionLabel = slide.heading || `Section ${slideIndex + 1}`;
  const statusLabel =
    connection === "live"
      ? "Live"
      : connection === "recovering"
        ? "Syncing"
        : connection === "offline"
          ? "Local"
          : "Connecting";

  return (
    <main className={`tp-display tp-theme-${theme}`}>
      <div
        ref={scrollerRef}
        className={`tp-reader ${chromeVisible ? "tp-reader-chrome" : ""}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        style={{ "--tp-font-scale": fontScale } as CSSProperties}
      >
        <SlideContent slide={slide} theme={theme} fontScale={fontScale} />
      </div>

      {chromeVisible ? (
        <header className="tp-display-header">
          <div className="tp-display-identity">
            <Image
              className="tp-display-wordmark"
              src={night ? "/brand/apostolic-guide-wordmark-reversed.png" : "/brand/apostolic-guide-wordmark.png"}
              alt="Apostolic Guide"
              width={148}
              height={31}
              priority
            />
            <div className="tp-display-context">
              {sectionLabel} · {statusLabel} {sessionCode}
            </div>
          </div>

          <div className="tp-display-controls">
            <span className="tp-page-count">
              {slideIndex + 1} / {slides.length}
            </span>
            <button
              type="button"
              onClick={() => dispatch({ type: "theme", theme: night ? "day" : "night" })}
            >
              {night ? "Day" : "Night"}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "fontScale", fontScale: fontScale - 0.05 })}
            >
              A−
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "fontScale", fontScale: fontScale + 0.05 })}
            >
              A+
            </button>
            <button
              type="button"
              onClick={() => void window.document.documentElement.requestFullscreen?.()}
            >
              Full
            </button>
            <button type="button" onClick={() => void copyController()} title={controllerUrl}>
              Remote
            </button>
          </div>
        </header>
      ) : null}

      <button
        type="button"
        className="tp-chrome-toggle"
        aria-label={chromeVisible ? "Hide teleprompter controls" : "Show teleprompter controls"}
        onClick={() => setChromeVisible((visible) => !visible)}
      >
        ···
      </button>
    </main>
  );
}

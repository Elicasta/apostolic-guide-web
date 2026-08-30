"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
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
  const [remoteQrOpen, setRemoteQrOpen] = useState(false);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const scrollCarryRef = useRef(0);
  const bottomStopRef = useRef(false);

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
      scrolling: false,
      scrollSpeed: 55,
      scrollTopSequence: 0,
      scrollNudgeSequence: 0,
      scrollNudgeDelta: 0,
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
  const scrolling = state?.scrolling ?? false;
  const scrollSpeed = state?.scrollSpeed ?? 55;
  const scrollTopSequence = state?.scrollTopSequence ?? 0;
  const scrollNudgeSequence = state?.scrollNudgeSequence ?? 0;
  const scrollNudgeDelta = state?.scrollNudgeDelta ?? 0;
  const slide = slides[Math.min(slideIndex, Math.max(slides.length - 1, 0))];
  const night = theme === "night";

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0, behavior: "auto" });
    scrollCarryRef.current = 0;
  }, [slideIndex]);

  useEffect(() => {
    if (scrollTopSequence <= 0) return;
    scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    scrollCarryRef.current = 0;
  }, [scrollTopSequence]);

  useEffect(() => {
    if (scrollNudgeSequence <= 0 || scrollNudgeDelta === 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ top: scrollNudgeDelta, behavior: "smooth" });
    scrollCarryRef.current = 0;
  }, [scrollNudgeDelta, scrollNudgeSequence]);

  useEffect(() => {
    if (!scrolling) {
      lastFrameRef.current = null;
      scrollCarryRef.current = 0;
      bottomStopRef.current = false;
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      return;
    }

    const tick = (timestamp: number) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const previous = lastFrameRef.current ?? timestamp;
      const elapsed = Math.min(timestamp - previous, 80);
      lastFrameRef.current = timestamp;

      const maxTop = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
      scrollCarryRef.current += (scrollSpeed * elapsed) / 1000;
      const wholePixels = Math.floor(scrollCarryRef.current);
      if (wholePixels > 0) {
        scrollCarryRef.current -= wholePixels;
        scroller.scrollTop = Math.min(scroller.scrollTop + wholePixels, maxTop);
      }

      if (scroller.scrollTop >= maxTop - 1) {
        if (!bottomStopRef.current) {
          bottomStopRef.current = true;
          dispatch({ type: "scroll", scrolling: false });
        }
        return;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastFrameRef.current = null;
      scrollCarryRef.current = 0;
    };
  }, [dispatch, scrollSpeed, scrolling]);

  const next = useCallback(() => dispatch({ type: "next" }), [dispatch]);
  const prev = useCallback(() => dispatch({ type: "prev" }), [dispatch]);
  const stopForManualScroll = useCallback(() => {
    if (scrolling) dispatch({ type: "scroll", scrolling: false });
  }, [dispatch, scrolling]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && remoteQrOpen) {
        setRemoteQrOpen(false);
        return;
      }
      if (event.key.toLowerCase() === "c") {
        setChromeVisible((visible) => !visible);
        return;
      }
      if (event.key.toLowerCase() === "f") {
        void window.document.documentElement.requestFullscreen?.();
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        dispatch({ type: "scroll", scrolling: !scrolling });
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        dispatch({ type: "scrollTop" });
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
  }, [dispatch, locked, next, prev, remoteQrOpen, scrolling]);

  const copyController = async () => {
    if (controllerUrl) await navigator.clipboard?.writeText(controllerUrl);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    stopForManualScroll();
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
        onWheel={stopForManualScroll}
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
              className={scrolling ? "is-active" : ""}
              onClick={() => dispatch({ type: "scroll", scrolling: !scrolling })}
            >
              {scrolling ? "Pause" : "Auto"}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "scrollSpeed", scrollSpeed: scrollSpeed - 5 })}
            >
              Slower
            </button>
            <span className="tp-scroll-speed">{scrollSpeed} px/s</span>
            <button
              type="button"
              onClick={() => dispatch({ type: "scrollSpeed", scrollSpeed: scrollSpeed + 5 })}
            >
              Faster
            </button>
            <button type="button" onClick={() => dispatch({ type: "scrollTop" })}>
              Top
            </button>
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
            <button
              type="button"
              onClick={() => setRemoteQrOpen(true)}
              title="Scan to open the remote"
            >
              Remote
            </button>
          </div>
        </header>
      ) : null}

      {remoteQrOpen && controllerUrl ? (
        <div
          className="tp-remote-qr-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.currentTarget === event.target) setRemoteQrOpen(false);
          }}
        >
          <section className="tp-remote-qr-card" role="dialog" aria-modal="true" aria-label="Connect teleprompter remote">
            <span className="tp-remote-qr-eyebrow">PHONE REMOTE</span>
            <h2>Scan to connect</h2>
            <p>Open your camera and scan this code. The remote will join this session automatically.</p>
            <div className="tp-remote-qr-code">
              <QRCodeSVG value={controllerUrl} size={256} level="M" marginSize={2} />
            </div>
            <div className="tp-remote-qr-session">Session {sessionCode}</div>
            <div className="tp-remote-qr-actions">
              <button type="button" onClick={() => void copyController()}>Copy link</button>
              <button type="button" onClick={() => setRemoteQrOpen(false)}>Close</button>
            </div>
          </section>
        </div>
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

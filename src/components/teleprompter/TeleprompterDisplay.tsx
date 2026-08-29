"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import SlideContent from "./SlideContent";
import { parseTeleprompterDocument, summarizeSlides } from "@/lib/teleprompter/parser";
import {
  closeTeleprompterChannel,
  createTeleprompterChannel,
  makeSessionCode,
  normalizeSessionCode,
  sendTeleprompterState,
} from "@/lib/teleprompter/realtime";
import {
  loadTeleprompterDocuments,
  selectTeleprompterDocument,
  setLastPresentedDocumentId,
} from "@/lib/teleprompter/storage";
import type {
  TeleprompterCommand,
  TeleprompterDocument,
  TeleprompterSessionState,
  TeleprompterTheme,
} from "@/lib/teleprompter/types";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface PointerStart {
  x: number;
  y: number;
}

export default function TeleprompterDisplay() {
  const [documents, setDocuments] = useState<TeleprompterDocument[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const [theme, setTheme] = useState<TeleprompterTheme>("night");
  const [fontScale, setFontScale] = useState(1);
  const [locked, setLocked] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [connection, setConnection] = useState<"idle" | "connecting" | "connected" | "unavailable">("idle");
  const [controllerUrl, setControllerUrl] = useState("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const slidesLengthRef = useRef(1);

  useEffect(() => {
    const loaded = loadTeleprompterDocuments();
    const params = new URLSearchParams(window.location.search);
    const requestedDoc = params.get("doc");
    const requestedSession = normalizeSessionCode(params.get("session"));
    const nextSession = requestedSession || makeSessionCode();
    const selected = selectTeleprompterDocument(loaded, requestedDoc);

    setDocuments(loaded);
    setDocumentId(selected?.id ?? "");
    if (selected?.id) setLastPresentedDocumentId(selected.id);
    setSessionCode(nextSession);

    params.set("session", nextSession);
    if (selected?.id) params.set("doc", selected.id);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    setControllerUrl(`${window.location.origin}/teleprompter/control?session=${nextSession}`);
  }, []);

  const selectedDocument = useMemo(
    () => documents.find((item) => item.id === documentId) ?? documents[0],
    [documents, documentId],
  );

  const slides = useMemo(
    () => parseTeleprompterDocument(selectedDocument?.content ?? ""),
    [selectedDocument?.content],
  );
  const slide = slides[clamp(slideIndex, 0, Math.max(slides.length - 1, 0))];
  const night = theme === "night";

  useEffect(() => {
    slidesLengthRef.current = Math.max(slides.length, 1);
    setSlideIndex((current) => clamp(current, 0, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [slideIndex]);

  const next = useCallback(() => {
    setSlideIndex((current) => clamp(current + 1, 0, slidesLengthRef.current - 1));
  }, []);

  const prev = useCallback(() => {
    setSlideIndex((current) => clamp(current - 1, 0, slidesLengthRef.current - 1));
  }, []);

  const applyRemoteCommand = useCallback(
    (command: TeleprompterCommand) => {
      switch (command.type) {
        case "next":
          next();
          break;
        case "prev":
          prev();
          break;
        case "goto":
          setSlideIndex(clamp(command.index, 0, slidesLengthRef.current - 1));
          break;
        case "theme":
          setTheme(command.theme);
          break;
        case "fontScale":
          setFontScale(clamp(command.fontScale, 0.8, 1.3));
          break;
        case "lock":
          setLocked(command.locked);
          break;
        case "mode":
          break;
      }
    },
    [next, prev],
  );

  const state = useMemo<TeleprompterSessionState>(
    () => ({
      title: selectedDocument?.title ?? "Teleprompter",
      documentId: selectedDocument?.id,
      slideIndex,
      theme,
      mode: "script",
      fontScale,
      locked,
      slides: summarizeSlides(slides),
    }),
    [selectedDocument?.id, selectedDocument?.title, fontScale, locked, slideIndex, slides, theme],
  );
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
    if (connection === "connected" && channelRef.current) {
      void sendTeleprompterState(channelRef.current, state);
    }
  }, [connection, state]);

  useEffect(() => {
    if (!sessionCode) return;

    const channel = createTeleprompterChannel(sessionCode);
    if (!channel) {
      setConnection("unavailable");
      return;
    }

    channelRef.current = channel;
    setConnection("connecting");

    channel
      .on("broadcast", { event: "command" }, ({ payload }) => {
        applyRemoteCommand(payload as TeleprompterCommand);
      })
      .on("broadcast", { event: "request-state" }, () => {
        void sendTeleprompterState(channel, stateRef.current);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("connected");
          void sendTeleprompterState(channel, stateRef.current);
        }
      });

    return () => {
      channelRef.current = null;
      void closeTeleprompterChannel(channel);
    };
  }, [applyRemoteCommand, sessionCode]);

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
    if (!controllerUrl) return;
    await navigator.clipboard?.writeText(controllerUrl);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (locked) {
      pointerStartRef.current = null;
      return;
    }

    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (Math.abs(deltaX) >= 90 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35) {
      if (deltaX < 0) next();
      else prev();
    }
  };

  if (!selectedDocument || !slide) return null;

  const sectionLabel = slide.heading || `Section ${slideIndex + 1}`;

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflow: "hidden",
        background: night ? "#0B0B0A" : "#F5F0E6",
        color: night ? "#F2EEE5" : "#191815",
        fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
      }}
    >
      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          scrollbarGutter: "stable",
          padding: chromeVisible
            ? "clamp(6.5rem, 11vh, 8.5rem) clamp(1.75rem, 7vw, 6rem) 18vh"
            : "clamp(3.5rem, 7vh, 5rem) clamp(1.75rem, 7vw, 6rem) 18vh",
          transition: "padding-top 150ms ease",
        }}
      >
        <SlideContent slide={slide} theme={theme} fontScale={fontScale} />
      </div>

      {chromeVisible ? (
        <header
          style={{
            position: "absolute",
            inset: "0 0 auto",
            zIndex: 2,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            alignItems: "center",
            gap: 20,
            padding: "max(16px, env(safe-area-inset-top)) clamp(18px, 3vw, 34px) 14px",
            background: night
              ? "linear-gradient(180deg, rgba(11,11,10,.98) 0%, rgba(11,11,10,.86) 72%, rgba(11,11,10,0) 100%)"
              : "linear-gradient(180deg, rgba(245,240,230,.98) 0%, rgba(245,240,230,.88) 72%, rgba(245,240,230,0) 100%)",
            pointerEvents: "none",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: ".15em",
                textTransform: "uppercase",
                color: night ? "#9D8C70" : "#7E705A",
                fontWeight: 720,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {selectedDocument.title}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: night ? "#5F5B54" : "#837C70",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {sectionLabel}
              {connection === "connected" ? ` · Remote ${sessionCode}` : connection === "unavailable" ? " · Local only" : ` · ${sessionCode}`}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 13,
              pointerEvents: "auto",
            }}
          >
            <span
              style={{
                color: night ? "#7B756C" : "#746D62",
                fontSize: 12,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {slideIndex + 1} / {slides.length}
            </span>
            <button type="button" onClick={() => setTheme((value) => (value === "night" ? "day" : "night"))} style={textButtonStyle(night)}>
              {night ? "Day" : "Night"}
            </button>
            <button type="button" onClick={() => setFontScale((value) => clamp(value - 0.05, 0.8, 1.3))} style={textButtonStyle(night)}>A−</button>
            <button type="button" onClick={() => setFontScale((value) => clamp(value + 0.05, 0.8, 1.3))} style={textButtonStyle(night)}>A+</button>
            <button type="button" onClick={() => void window.document.documentElement.requestFullscreen?.()} style={textButtonStyle(night)}>Full</button>
            <button type="button" onClick={() => void copyController()} style={textButtonStyle(night)} title={controllerUrl}>Remote</button>
          </div>
        </header>
      ) : null}

      <button
        type="button"
        aria-label={chromeVisible ? "Hide teleprompter controls" : "Show teleprompter controls"}
        onClick={() => setChromeVisible((visible) => !visible)}
        style={{
          position: "absolute",
          right: 12,
          bottom: "max(12px, env(safe-area-inset-bottom))",
          zIndex: 3,
          width: 28,
          height: 28,
          appearance: "none",
          border: 0,
          borderRadius: 999,
          background: "transparent",
          color: night ? "#514E48" : "#9A9285",
          fontSize: 17,
          cursor: "pointer",
        }}
      >
        ···
      </button>
    </main>
  );
}

function textButtonStyle(night: boolean): CSSProperties {
  return {
    appearance: "none",
    border: 0,
    background: "transparent",
    color: night ? "#817B72" : "#6E675D",
    padding: "5px 0",
    fontSize: 11,
    letterSpacing: ".04em",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

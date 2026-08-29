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
import { loadTeleprompterDocuments } from "@/lib/teleprompter/storage";
import type {
  TeleprompterCommand,
  TeleprompterDocument,
  TeleprompterMode,
  TeleprompterSessionState,
  TeleprompterTheme,
} from "@/lib/teleprompter/types";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function TeleprompterDisplay() {
  const [documents, setDocuments] = useState<TeleprompterDocument[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const [theme, setTheme] = useState<TeleprompterTheme>("night");
  const [mode, setMode] = useState<TeleprompterMode>("cue");
  const [fontScale, setFontScale] = useState(1);
  const [locked, setLocked] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [connection, setConnection] = useState<"idle" | "connecting" | "connected" | "unavailable">("idle");
  const [controllerUrl, setControllerUrl] = useState("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pointerStartRef = useRef<number | null>(null);

  useEffect(() => {
    const loaded = loadTeleprompterDocuments();
    const params = new URLSearchParams(window.location.search);
    const requestedDoc = params.get("doc");
    const requestedSession = normalizeSessionCode(params.get("session"));
    const nextSession = requestedSession || makeSessionCode();
    const selected = loaded.find((doc) => doc.id === requestedDoc) ?? loaded[0];

    setDocuments(loaded);
    setDocumentId(selected?.id ?? "");
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
    setSlideIndex((current) => clamp(current, 0, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  const next = useCallback(() => {
    setSlideIndex((current) => clamp(current + 1, 0, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  const prev = useCallback(() => {
    setSlideIndex((current) => clamp(current - 1, 0, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

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
          setSlideIndex(clamp(command.index, 0, Math.max(slides.length - 1, 0)));
          break;
        case "theme":
          setTheme(command.theme);
          break;
        case "mode":
          setMode(command.mode);
          break;
        case "fontScale":
          setFontScale(clamp(command.fontScale, 0.75, 1.35));
          break;
        case "lock":
          setLocked(command.locked);
          break;
      }
    },
    [next, prev, slides.length],
  );

  const state = useMemo<TeleprompterSessionState>(
    () => ({
      title: selectedDocument?.title ?? "Teleprompter",
      documentId: selectedDocument?.id,
      slideIndex,
      theme,
      mode,
      fontScale,
      locked,
      slides: summarizeSlides(slides),
    }),
    [selectedDocument?.id, selectedDocument?.title, fontScale, locked, mode, slideIndex, slides, theme],
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

      if (["ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        next();
      }
      if (["ArrowLeft", "PageUp"].includes(event.key)) {
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
    pointerStartRef.current = event.clientX;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (locked) {
      pointerStartRef.current = null;
      return;
    }

    const start = pointerStartRef.current ?? event.clientX;
    pointerStartRef.current = null;
    const distance = event.clientX - start;

    if (Math.abs(distance) >= 70) {
      if (distance < 0) next();
      else prev();
      return;
    }

    const x = event.clientX / window.innerWidth;
    if (x < 0.34) prev();
    else if (x > 0.66) next();
    else setChromeVisible((visible) => !visible);
  };

  if (!selectedDocument || !slide) return null;

  return (
    <main
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflow: "hidden",
        background: night ? "#0C0C0B" : "#F3EFE5",
        color: night ? "#F2EEE5" : "#191815",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          padding: chromeVisible
            ? "clamp(5rem, 10vh, 8.5rem) clamp(2rem, 8vw, 9rem) clamp(5rem, 9vh, 7rem)"
            : "clamp(2rem, 7vh, 5rem) clamp(2rem, 8vw, 9rem)",
          transition: "padding 150ms ease",
        }}
      >
        <SlideContent slide={slide} mode={mode} theme={theme} fontScale={fontScale} />
      </div>

      {chromeVisible ? (
        <>
          <header
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            style={{
              position: "absolute",
              inset: "0 0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 18,
              padding: "18px clamp(18px, 3vw, 42px)",
              background: night ? "rgba(12,12,11,.94)" : "rgba(243,239,229,.94)",
              borderBottom: `1px solid ${night ? "rgba(255,255,255,.08)" : "rgba(25,24,21,.1)"}`,
              backdropFilter: "blur(14px)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: night ? "#B99A66" : "#8A6B39", fontWeight: 750 }}>
                Apostolic Guide · Teleprompter Beta
              </div>
              <div style={{ marginTop: 3, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {selectedDocument.title}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => void copyController()} style={chipStyle(night)} title={controllerUrl}>
                {connection === "connected" ? "Remote connected" : connection === "unavailable" ? "Local only" : `Remote ${sessionCode}`}
              </button>
              <a href="/teleprompter/library" style={chipStyle(night)}>Library</a>
              <button type="button" onClick={() => setTheme((value) => (value === "night" ? "day" : "night"))} style={chipStyle(night)}>
                {night ? "Day" : "Night"}
              </button>
              <button type="button" onClick={() => setMode(nextMode(mode))} style={chipStyle(night)}>
                {mode}
              </button>
              <button type="button" onClick={() => setFontScale((value) => clamp(value - 0.05, 0.75, 1.35))} style={chipStyle(night)}>A−</button>
              <button type="button" onClick={() => setFontScale((value) => clamp(value + 0.05, 0.75, 1.35))} style={chipStyle(night)}>A+</button>
              <button type="button" onClick={() => setLocked((value) => !value)} style={chipStyle(night)}>{locked ? "Unlock" : "Lock"}</button>
              <button type="button" onClick={() => void window.document.documentElement.requestFullscreen?.()} style={chipStyle(night)}>Full</button>
            </div>
          </header>

          <footer
            style={{
              position: "absolute",
              left: "clamp(18px, 3vw, 42px)",
              right: "clamp(18px, 3vw, 42px)",
              bottom: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: night ? "#777166" : "#7A7163",
              fontSize: 12,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              pointerEvents: "none",
            }}
          >
            <span>{locked ? "Display locked · remote still active" : "Tap edges or swipe"}</span>
            <span>{slideIndex + 1} / {slides.length}</span>
          </footer>
        </>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: night ? "rgba(255,255,255,.06)" : "rgba(25,24,21,.08)",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: `${((slideIndex + 1) / slides.length) * 100}%`,
            height: "100%",
            background: night ? "#9A7D50" : "#8A6B39",
            transition: "width 120ms ease",
          }}
        />
      </div>
    </main>
  );
}

function nextMode(mode: TeleprompterMode): TeleprompterMode {
  if (mode === "script") return "cue";
  if (mode === "cue") return "minimal";
  return "script";
}

function chipStyle(night: boolean): CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${night ? "rgba(255,255,255,.12)" : "rgba(25,24,21,.14)"}`,
    background: night ? "#151513" : "#EBE5D8",
    color: night ? "#DAD4C8" : "#332F28",
    borderRadius: 999,
    padding: "8px 11px",
    fontSize: 11,
    lineHeight: 1,
    textTransform: "capitalize",
    textDecoration: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

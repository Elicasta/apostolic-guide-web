"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { normalizeSessionCode } from "@/lib/teleprompter/realtime";
import { useTeleprompterSessionSync } from "@/lib/teleprompter/use-session-sync";
import type { TeleprompterAction } from "@/lib/teleprompter/types";

const SPEED_PRESETS = [40, 50, 55, 70] as const;
const NUDGE_PX = 110;

export default function TeleprompterController() {
  const [sessionCode, setSessionCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [scrollPanelOpen, setScrollPanelOpen] = useState(false);
  const [pairQrOpen, setPairQrOpen] = useState(false);
  const [pairUrl, setPairUrl] = useState("");
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const { state, connection, dispatch } = useTeleprompterSessionSync({
    sessionCode,
    role: "remote",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = normalizeSessionCode(params.get("session"));
    if (code) {
      setSessionCode(code);
      setJoinCode(code);
      setPairUrl(`${window.location.origin}/teleprompter/control?session=${code}`);
    }
  }, []);

  const send = (action: TeleprompterAction) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(8);
    }
    dispatch(action);
  };

  const clearHold = () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    if (holdIntervalRef.current !== null) window.clearInterval(holdIntervalRef.current);
    holdTimerRef.current = null;
    holdIntervalRef.current = null;
  };

  const beginHoldNudge = (delta: number) => {
    clearHold();
    holdTimerRef.current = window.setTimeout(() => {
      send({ type: "scrollNudge", delta });
      holdIntervalRef.current = window.setInterval(
        () => send({ type: "scrollNudge", delta }),
        180,
      );
    }, 320);
  };

  useEffect(() => clearHold, []);

  const join = () => {
    const code = normalizeSessionCode(joinCode);
    if (!code) return;
    setSessionCode(code);
    setPairUrl(`${window.location.origin}/teleprompter/control?session=${code}`);
    const params = new URLSearchParams(window.location.search);
    params.set("session", code);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
  };

  if (!sessionCode) {
    return (
      <RemoteShell>
        <div className="tp-join-panel">
          <Brand />
          <p className="tp-eyebrow">Teleprompter Remote</p>
          <h1>Join display.</h1>
          <p className="tp-muted">Enter the session code shown on the iPad.</p>
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(normalizeSessionCode(event.target.value))}
            onKeyDown={(event) => event.key === "Enter" && join()}
            placeholder="ABCD12345"
            autoCapitalize="characters"
            autoCorrect="off"
            className="tp-code-input"
          />
          <button type="button" onClick={join} className="tp-primary-button">
            Connect
          </button>
        </div>
      </RemoteShell>
    );
  }

  const current = state?.slides[state.slideIndex];
  const atStart = !state || state.slideIndex <= 0;
  const atEnd = !state || state.slideIndex >= state.slides.length - 1;
  const scrolling = state?.scrolling ?? false;
  const scrollSpeed = state?.scrollSpeed ?? 55;

  return (
    <RemoteShell>
      <div className="tp-remote-panel">
        <header className="tp-remote-header">
          <div className="tp-remote-title">
            <Brand />
            <p className="tp-eyebrow">Teleprompter · {sessionCode}</p>
            <h1>{state?.title ?? "Finding display…"}</h1>
          </div>
          <ConnectionPill connection={connection} />
        </header>

        <button
          type="button"
          className="tp-pair-remote-button"
          onClick={() => setPairQrOpen((open) => !open)}
        >
          <span aria-hidden="true">▦</span>
          {pairQrOpen ? "Hide pairing QR" : "Pair another remote"}
        </button>

        {pairQrOpen && pairUrl ? (
          <section className="tp-controller-pair-card" aria-label="Pair another teleprompter remote">
            <div className="tp-remote-qr-code">
              <QRCodeSVG value={pairUrl} size={220} level="M" marginSize={2} />
            </div>
            <p>Scan with another phone to join session {sessionCode}.</p>
          </section>
        ) : null}

        <section className="tp-current-section" aria-live="polite">
          <div className="tp-current-meta">
            <span>Current section</span>
            <strong>
              {state ? `${state.slideIndex + 1} / ${state.slides.length}` : "—"}
            </strong>
          </div>
          <div className="tp-current-title">
            {current?.heading || current?.preview || "Synchronizing…"}
          </div>
          {current?.reference ? (
            <div className="tp-current-reference">{current.reference}</div>
          ) : null}
        </section>

        <section className={`tp-scroll-remote ${scrollPanelOpen ? "is-open" : "is-collapsed"}`} aria-label="Scroll controls">
          <button
            type="button"
            className="tp-scroll-panel-toggle"
            onClick={() => setScrollPanelOpen((open) => !open)}
          >
            <span>
              <b>Scroll</b>
              <small>{scrolling ? `Running · ${scrollSpeed}` : `${scrollSpeed} px/sec`}</small>
            </span>
            <strong>{scrollPanelOpen ? "Hide" : "Show"}</strong>
          </button>

          {scrollPanelOpen ? (
            <div className="tp-scroll-panel-body">
              <div className="tp-scroll-remote-header">
                <div>
                  <p className="tp-eyebrow">Auto scroll</p>
                  <strong>{scrollSpeed} px/sec</strong>
                </div>
                <span className={scrolling ? "is-running" : ""}>
                  {scrolling ? "Running" : "Stopped"}
                </span>
              </div>

              <button
                type="button"
                className={`tp-primary-button tp-scroll-toggle ${scrolling ? "is-paused" : ""}`}
                onClick={() => send({ type: "scroll", scrolling: !scrolling })}
                disabled={!state}
              >
                {scrolling ? "Pause Auto Scroll" : "Start Auto Scroll"}
              </button>

              <div className="tp-speed-stepper">
                <button
                  type="button"
                  onClick={() => state && send({ type: "scrollSpeed", scrollSpeed: scrollSpeed - 5 })}
                  disabled={!state || scrollSpeed <= 20}
                >
                  − 5
                </button>
                <button
                  type="button"
                  onClick={() => state && send({ type: "scrollSpeed", scrollSpeed: scrollSpeed + 5 })}
                  disabled={!state || scrollSpeed >= 180}
                >
                  + 5
                </button>
              </div>

              <div className="tp-speed-presets">
                {SPEED_PRESETS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={Math.abs(scrollSpeed - speed) < 2.5 ? "is-active" : ""}
                    onClick={() => send({ type: "scrollSpeed", scrollSpeed: speed })}
                    disabled={!state}
                  >
                    {speed === 40 ? "Slow" : speed === 50 ? "Easy" : speed === 55 ? "Natural" : "Quick"}
                  </button>
                ))}
              </div>

              <div className="tp-page-rocker" aria-label="Manual page position">
                <p className="tp-eyebrow">Page position</p>
                <div>
                  <button
                    type="button"
                    onClick={() => send({ type: "scrollNudge", delta: -NUDGE_PX })}
                    onPointerDown={() => beginHoldNudge(-NUDGE_PX)}
                    onPointerUp={clearHold}
                    onPointerCancel={clearHold}
                    onPointerLeave={clearHold}
                    disabled={!state}
                  >
                    ↑
                    <span>Up</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => send({ type: "scrollNudge", delta: NUDGE_PX })}
                    onPointerDown={() => beginHoldNudge(NUDGE_PX)}
                    onPointerUp={clearHold}
                    onPointerCancel={clearHold}
                    onPointerLeave={clearHold}
                    disabled={!state}
                  >
                    ↓
                    <span>Down</span>
                  </button>
                </div>
                <small>Tap to nudge. Hold to keep moving.</small>
              </div>

              <button
                type="button"
                className="tp-secondary-button tp-top-button"
                onClick={() => send({ type: "scrollTop" })}
                disabled={!state}
              >
                ↑ Back to Top
              </button>
            </div>
          ) : null}
        </section>

        <div className="tp-transport">
          <button
            type="button"
            className="tp-secondary-button"
            onClick={() => send({ type: "prev" })}
            disabled={atStart}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="tp-primary-button tp-next-button"
            onClick={() => send({ type: "next" })}
            disabled={atEnd}
          >
            Next →
          </button>
        </div>

        <div className="tp-quick-controls">
          <button
            type="button"
            onClick={() =>
              send({ type: "theme", theme: state?.theme === "night" ? "day" : "night" })
            }
            disabled={!state}
          >
            {state?.theme === "night" ? "Day" : "Night"}
          </button>
          <button
            type="button"
            onClick={() => state && send({ type: "fontScale", fontScale: state.fontScale - 0.05 })}
            disabled={!state}
          >
            A−
          </button>
          <button
            type="button"
            onClick={() => state && send({ type: "fontScale", fontScale: state.fontScale + 0.05 })}
            disabled={!state}
          >
            A+
          </button>
          <button type="button" onClick={() => send({ type: "scrollTop" })} disabled={!state}>
            Top
          </button>
        </div>

        <section className="tp-section-list">
          <div className="tp-section-list-header">
            <p className="tp-eyebrow">Sections</p>
            <span>Tap to jump · auto-scroll stops</span>
          </div>
          <div>
            {state?.slides.map((slide, index) => {
              const active = index === state.slideIndex;
              return (
                <button
                  key={slide.id}
                  type="button"
                  className={active ? "is-active" : ""}
                  onClick={() => send({ type: "goto", index })}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{slide.heading || slide.preview}</strong>
                  <i aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </RemoteShell>
  );
}

function Brand() {
  return (
    <Image
      className="tp-remote-wordmark"
      src="/brand/apostolic-guide-wordmark-reversed.png"
      alt="Apostolic Guide"
      width={164}
      height={34}
      priority
    />
  );
}

function RemoteShell({ children }: { children: React.ReactNode }) {
  return <main className="tp-remote">{children}</main>;
}

function ConnectionPill({ connection }: { connection: string }) {
  const label =
    connection === "live"
      ? "Synced"
      : connection === "recovering"
        ? "Recovering"
        : connection === "offline"
          ? "Offline"
          : "Connecting";
  return (
    <div className={`tp-connection tp-connection-${connection}`}>
      <span aria-hidden="true" />
      {label}
    </div>
  );
}

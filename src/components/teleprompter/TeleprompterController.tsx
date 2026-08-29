"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { normalizeSessionCode } from "@/lib/teleprompter/realtime";
import { useTeleprompterSessionSync } from "@/lib/teleprompter/use-session-sync";
import type { TeleprompterAction } from "@/lib/teleprompter/types";

export default function TeleprompterController() {
  const [sessionCode, setSessionCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
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
    }
  }, []);

  const send = (action: TeleprompterAction) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(8);
    }
    dispatch(action);
  };

  const join = () => {
    const code = normalizeSessionCode(joinCode);
    if (!code) return;
    setSessionCode(code);
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
        </div>

        <section className="tp-section-list">
          <div className="tp-section-list-header">
            <p className="tp-eyebrow">Sections</p>
            <span>Tap to jump</span>
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

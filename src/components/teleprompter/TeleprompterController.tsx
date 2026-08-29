"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  closeTeleprompterChannel,
  createTeleprompterChannel,
  normalizeSessionCode,
  requestTeleprompterState,
  sendTeleprompterCommand,
} from "@/lib/teleprompter/realtime";
import type {
  TeleprompterCommand,
  TeleprompterSessionState,
} from "@/lib/teleprompter/types";

export default function TeleprompterController() {
  const [sessionCode, setSessionCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [connection, setConnection] = useState<"idle" | "connecting" | "connected" | "unavailable">("idle");
  const [state, setState] = useState<TeleprompterSessionState | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = normalizeSessionCode(params.get("session"));
    if (code) {
      setSessionCode(code);
      setJoinCode(code);
    }
  }, []);

  useEffect(() => {
    if (!sessionCode) return;
    const channel = createTeleprompterChannel(sessionCode);
    if (!channel) {
      setConnection("unavailable");
      return;
    }

    channelRef.current = channel;
    setConnection("connecting");
    setState(null);

    channel
      .on("broadcast", { event: "state" }, ({ payload }) => {
        setState(payload as TeleprompterSessionState);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("connected");
          void requestTeleprompterState(channel);
        }
      });

    return () => {
      channelRef.current = null;
      void closeTeleprompterChannel(channel);
    };
  }, [sessionCode]);

  const send = async (command: TeleprompterCommand) => {
    const channel = channelRef.current;
    if (!channel || connection !== "connected") return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
    await sendTeleprompterCommand(channel, command);
  };

  const join = () => {
    const code = normalizeSessionCode(joinCode);
    if (!code) return;
    setSessionCode(code);
    const params = new URLSearchParams(window.location.search);
    params.set("session", code);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  };

  if (!sessionCode) {
    return (
      <RemoteShell>
        <div style={{ width: "100%", maxWidth: 430, margin: "auto" }}>
          <Eyebrow>Teleprompter Remote</Eyebrow>
          <h1 style={{ margin: "12px 0 8px", fontSize: "clamp(2.2rem, 12vw, 4rem)", letterSpacing: "-.055em", lineHeight: .95 }}>Join display.</h1>
          <p style={{ color: "#8E887E", lineHeight: 1.55, marginBottom: 26 }}>Enter the session code shown on the iPad.</p>
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(normalizeSessionCode(event.target.value))}
            onKeyDown={(event) => event.key === "Enter" && join()}
            placeholder="ABCD123"
            autoCapitalize="characters"
            autoCorrect="off"
            style={inputStyle}
          />
          <button type="button" onClick={join} style={primaryButtonStyle}>Connect</button>
        </div>
      </RemoteShell>
    );
  }

  const current = state?.slides[state.slideIndex];

  return (
    <RemoteShell>
      <div style={{ width: "100%", maxWidth: 580, margin: "0 auto", paddingBottom: 70 }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 34 }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow>Teleprompter · {sessionCode}</Eyebrow>
            <h1 style={{ margin: "8px 0 0", fontSize: "clamp(1.55rem, 7vw, 2.4rem)", lineHeight: 1, letterSpacing: "-.045em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {state?.title ?? "Connecting…"}
            </h1>
          </div>
          <ConnectionPill connection={connection} />
        </header>

        {connection === "unavailable" ? (
          <div style={noticeStyle}>Realtime is unavailable in this environment. The iPad display still works locally.</div>
        ) : null}

        <section style={{ padding: "6px 0 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "#706B63", fontSize: 11, letterSpacing: ".13em", textTransform: "uppercase" }}>
            <span>Current section</span>
            <span>{state ? `${state.slideIndex + 1} / ${state.slides.length}` : "—"}</span>
          </div>
          <div style={{ marginTop: 14, color: "#F0EAE0", fontSize: "clamp(1.8rem, 9vw, 3.2rem)", lineHeight: 1.02, letterSpacing: "-.05em", fontWeight: 660 }}>
            {current?.heading || current?.preview || "Waiting for the iPad…"}
          </div>
          {current?.reference ? (
            <div style={{ marginTop: 12, color: "#9A8058", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase" }}>
              {current.reference}
            </div>
          ) : null}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 10 }}>
          <button type="button" onClick={() => void send({ type: "prev" })} disabled={!state || state.slideIndex <= 0} style={secondaryButtonStyle}>← Previous</button>
          <button type="button" onClick={() => void send({ type: "next" })} disabled={!state || state.slideIndex >= state.slides.length - 1} style={primaryButtonStyle}>Next →</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18, margin: "24px 0 34px", color: "#706A61" }}>
          <button type="button" onClick={() => void send({ type: "theme", theme: state?.theme === "night" ? "day" : "night" })} style={plainControlStyle}>
            {state?.theme === "night" ? "Day" : "Night"}
          </button>
          <button type="button" onClick={() => state && void send({ type: "fontScale", fontScale: Math.max(.8, state.fontScale - .05) })} style={plainControlStyle}>A−</button>
          <button type="button" onClick={() => state && void send({ type: "fontScale", fontScale: Math.min(1.3, state.fontScale + .05) })} style={plainControlStyle}>A+</button>
        </div>

        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <Eyebrow>Sections</Eyebrow>
            <span style={{ color: "#5D5952", fontSize: 11 }}>Tap to jump</span>
          </div>
          <div style={{ borderTop: "1px solid #26241F" }}>
            {state?.slides.map((slide, index) => {
              const active = index === state.slideIndex;
              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => void send({ type: "goto", index })}
                  style={{
                    appearance: "none",
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "38px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                    textAlign: "left",
                    border: 0,
                    borderBottom: "1px solid #26241F",
                    background: "transparent",
                    color: active ? "#F0E9DD" : "#938D84",
                    padding: "15px 0",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: active ? "#B99A66" : "#555149", fontVariantNumeric: "tabular-nums", fontSize: 11 }}>{String(index + 1).padStart(2, "0")}</span>
                  <span style={{ lineHeight: 1.25, fontWeight: active ? 650 : 480 }}>{slide.heading || slide.preview}</span>
                  <span style={{ color: active ? "#B99A66" : "transparent", fontSize: 16 }}>•</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </RemoteShell>
  );
}

function RemoteShell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ position: "fixed", inset: 0, zIndex: 9999, overflowY: "auto", background: "#0B0B0A", color: "#F2EEE5", padding: "max(24px, env(safe-area-inset-top)) 18px max(30px, env(safe-area-inset-bottom))", fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)" }}>
      {children}
    </main>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#9D835D", fontSize: 10, fontWeight: 760, letterSpacing: ".17em", textTransform: "uppercase" }}>{children}</div>;
}

function ConnectionPill({ connection }: { connection: "idle" | "connecting" | "connected" | "unavailable" }) {
  const label = connection === "connected" ? "Live" : connection === "unavailable" ? "Offline" : "Connecting";
  return <div style={{ flex: "0 0 auto", color: connection === "connected" ? "#B99A66" : "#68635C", paddingTop: 2, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>{label}</div>;
}

const noticeStyle: React.CSSProperties = {
  marginBottom: 20,
  borderLeft: "2px solid #665232",
  color: "#B8AA8D",
  padding: "4px 0 4px 12px",
  fontSize: 12,
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #34312C",
  background: "#121210",
  color: "#F2EEE5",
  borderRadius: 14,
  padding: "17px 16px",
  outline: "none",
  fontSize: 24,
  letterSpacing: ".12em",
  textTransform: "uppercase",
};

const primaryButtonStyle: React.CSSProperties = {
  appearance: "none",
  width: "100%",
  border: "1px solid #A68755",
  background: "#9A7D50",
  color: "#0B0B0A",
  borderRadius: 15,
  padding: "18px 18px",
  fontSize: 15,
  fontWeight: 760,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  appearance: "none",
  width: "100%",
  border: "1px solid #2B2925",
  background: "#131311",
  color: "#AAA49A",
  borderRadius: 15,
  padding: "18px 14px",
  fontSize: 13,
  fontWeight: 650,
  cursor: "pointer",
};

const plainControlStyle: React.CSSProperties = {
  appearance: "none",
  border: 0,
  background: "transparent",
  color: "#817B72",
  padding: 0,
  fontSize: 12,
  cursor: "pointer",
};

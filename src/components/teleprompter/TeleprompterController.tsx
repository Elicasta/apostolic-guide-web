"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  TeleprompterMode,
  TeleprompterSessionState,
  TeleprompterTheme,
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

  return (
    <RemoteShell>
      <div style={{ width: "100%", maxWidth: 620, margin: "0 auto", paddingBottom: 130 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow>Teleprompter Remote · {sessionCode}</Eyebrow>
            <h1 style={{ margin: "8px 0 0", fontSize: "clamp(1.6rem, 8vw, 2.65rem)", lineHeight: 1, letterSpacing: "-.045em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {state?.title ?? "Connecting…"}
            </h1>
          </div>
          <ConnectionPill connection={connection} />
        </div>

        {connection === "unavailable" ? (
          <div style={noticeStyle}>Supabase realtime is not configured in this environment. The iPad display still works locally.</div>
        ) : null}

        <section style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "#8E887E", fontSize: 12, letterSpacing: ".11em", textTransform: "uppercase" }}>
            <span>Current</span>
            <span>{state ? `${state.slideIndex + 1} / ${state.slides.length}` : "—"}</span>
          </div>
          <div style={{ marginTop: 18, minHeight: 118, display: "flex", alignItems: "center", fontSize: "clamp(1.55rem, 7vw, 2.4rem)", lineHeight: 1.08, letterSpacing: "-.035em", fontWeight: 620 }}>
            {state?.slides[state.slideIndex]?.preview ?? "Waiting for the iPad…"}
          </div>
          {state?.slides[state.slideIndex]?.reference ? (
            <div style={{ marginTop: 16, color: "#B99A66", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase" }}>
              {state.slides[state.slideIndex].reference}
            </div>
          ) : null}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: 10, marginTop: 10 }}>
          <button type="button" onClick={() => void send({ type: "prev" })} disabled={!state} style={secondaryButtonStyle}>← Previous</button>
          <button type="button" onClick={() => void send({ type: "next" })} disabled={!state} style={{ ...primaryButtonStyle, marginTop: 0 }}>Next →</button>
        </div>

        <section style={{ ...panelStyle, marginTop: 10, padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <ControlButton label={state?.theme === "night" ? "Day" : "Night"} active={false} onClick={() => void send({ type: "theme", theme: state?.theme === "night" ? "day" : "night" })} />
            <ControlButton label="A−" active={false} onClick={() => state && void send({ type: "fontScale", fontScale: Math.max(.75, state.fontScale - .05) })} />
            <ControlButton label="A+" active={false} onClick={() => state && void send({ type: "fontScale", fontScale: Math.min(1.35, state.fontScale + .05) })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 8 }}>
            {(["script", "cue", "minimal"] as TeleprompterMode[]).map((value) => (
              <ControlButton key={value} label={value} active={state?.mode === value} onClick={() => void send({ type: "mode", mode: value })} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void send({ type: "lock", locked: !state?.locked })}
            style={{ ...secondaryButtonStyle, width: "100%", marginTop: 8, borderColor: state?.locked ? "#B99A66" : undefined, color: state?.locked ? "#D7C294" : undefined }}
          >
            {state?.locked ? "Unlock iPad controls" : "Lock iPad controls"}
          </button>
        </section>

        <section style={{ marginTop: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <Eyebrow>Slides</Eyebrow>
            <span style={{ color: "#625E56", fontSize: 12 }}>Tap to jump</span>
          </div>
          <div style={{ display: "grid", gap: 7 }}>
            {state?.slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => void send({ type: "goto", index })}
                style={{
                  appearance: "none",
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "38px 1fr",
                  gap: 12,
                  alignItems: "start",
                  textAlign: "left",
                  border: `1px solid ${index === state.slideIndex ? "#8D734B" : "#2B2925"}`,
                  background: index === state.slideIndex ? "#1D1A15" : "#131311",
                  color: index === state.slideIndex ? "#F1EBDD" : "#A9A39A",
                  borderRadius: 14,
                  padding: "13px 14px",
                  cursor: "pointer",
                }}
              >
                <span style={{ color: index === state.slideIndex ? "#B99A66" : "#5E5951", fontVariantNumeric: "tabular-nums", fontSize: 12, paddingTop: 2 }}>{String(index + 1).padStart(2, "0")}</span>
                <span style={{ lineHeight: 1.28 }}>{slide.preview}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </RemoteShell>
  );
}

function RemoteShell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ position: "fixed", inset: 0, zIndex: 9999, overflowY: "auto", background: "#0C0C0B", color: "#F2EEE5", padding: "max(22px, env(safe-area-inset-top)) 16px max(26px, env(safe-area-inset-bottom))", fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)" }}>
      {children}
    </main>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#B99A66", fontSize: 11, fontWeight: 760, letterSpacing: ".17em", textTransform: "uppercase" }}>{children}</div>;
}

function ConnectionPill({ connection }: { connection: "idle" | "connecting" | "connected" | "unavailable" }) {
  const label = connection === "connected" ? "Live" : connection === "unavailable" ? "Offline" : "Connecting";
  return <div style={{ flex: "0 0 auto", border: "1px solid #2B2925", background: "#141412", color: connection === "connected" ? "#C3A875" : "#777168", borderRadius: 999, padding: "8px 10px", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</div>;
}

function ControlButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={{ ...secondaryButtonStyle, textTransform: "capitalize", borderColor: active ? "#8D734B" : "#2B2925", color: active ? "#E7D7B8" : "#AAA49A", background: active ? "#211D16" : "#141412" }}>{label}</button>;
}

const panelStyle: React.CSSProperties = {
  border: "1px solid #292722",
  background: "#11110F",
  borderRadius: 20,
  padding: 18,
};

const noticeStyle: React.CSSProperties = {
  marginBottom: 12,
  border: "1px solid #4A3C27",
  background: "#1B1710",
  color: "#C8B690",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 13,
  lineHeight: 1.45,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #34312C",
  background: "#121210",
  color: "#F2EEE5",
  borderRadius: 16,
  padding: "17px 16px",
  outline: "none",
  fontSize: 24,
  letterSpacing: ".12em",
  textTransform: "uppercase",
};

const primaryButtonStyle: React.CSSProperties = {
  appearance: "none",
  width: "100%",
  marginTop: 10,
  border: "1px solid #A68755",
  background: "#9A7D50",
  color: "#0B0B0A",
  borderRadius: 16,
  padding: "17px 18px",
  fontSize: 16,
  fontWeight: 760,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  appearance: "none",
  border: "1px solid #2B2925",
  background: "#141412",
  color: "#AAA49A",
  borderRadius: 14,
  padding: "14px 12px",
  fontSize: 13,
  fontWeight: 650,
  cursor: "pointer",
};

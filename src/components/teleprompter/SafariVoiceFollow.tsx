"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCloudDocuments, fromCloud } from "@/lib/teleprompter/cloud-storage";
import { parseTeleprompterDocument } from "@/lib/teleprompter/parser";
import { loadTeleprompterDocuments } from "@/lib/teleprompter/storage";
import { advanceVoiceFollow, finishVoiceFollow, initialVoiceFollowState } from "@/lib/teleprompter/voice-follow";
import type { VoiceFollowNote, VoiceFollowState } from "@/lib/teleprompter/voice-follow";
import { createVoiceDeck, deckCursorForPosition, findDeckPosition } from "@/lib/teleprompter/voice-deck";
import type { TeleprompterAction, TeleprompterSlide, TeleprompterSessionState } from "@/lib/teleprompter/types";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
interface SpeechEngine {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface BrowserVoiceWindow extends Window {
  SpeechRecognition?: new () => SpeechEngine;
  webkitSpeechRecognition?: new () => SpeechEngine;
}
type Props = {
  documentId: string | undefined;
  slides?: TeleprompterSlide[];
  session: TeleprompterSessionState | null;
  dispatch: (action: TeleprompterAction) => void;
  compact?: boolean;
};
const NOTES_PREFIX = "ag:teleprompter:voice-notes:v1:";
function loadNotes(documentId: string): VoiceFollowNote[] {
  if (!documentId) return [];
  try {
    const data: unknown = JSON.parse(localStorage.getItem(NOTES_PREFIX + documentId) || "[]");
    if (Array.isArray(data)) return data.filter(item =>
      typeof item?.text === "string" &&
      typeof item?.anchorWord === "number" &&
      typeof item?.startedAt === "number" &&
      typeof item?.endedAt === "number",
    ) as VoiceFollowNote[];
  } catch { /* Storage can be unavailable in private browsing. */ }
  return [];
}
function saveNotes(documentId: string, notes: VoiceFollowNote[]) {
  if (!documentId) return;
  try { localStorage.setItem(NOTES_PREFIX + documentId, JSON.stringify(notes)); }
  catch { /* Export remains available from in-memory state. */ }
}
function exportNotes(documentId: string, title: string, notes: VoiceFollowNote[]) {
  const lines = [`# Voice Follow Notes: ${title}`, "", `Document: ${documentId}`, ""];
  notes.forEach((note, i) => lines.push(
    `## Improvisation ${i + 1}`, `Captured: ${new Date(note.startedAt).toLocaleString()}`,
    `Script word: ${note.anchorWord}`, note.reference ? `Scripture reference (unverified): ${note.reference}` : "",
    "", note.text, "",
  ));
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `voice-notes-${documentId.replace(/[^A-Za-z0-9_-]/g, "-")}.md`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Safari's on-device browser interface, not an OpenAI audio upload. */
export default function SafariVoiceFollow({ documentId, slides: suppliedSlides, session, dispatch, compact = false }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [remoteSlides, setRemoteSlides] = useState<TeleprompterSlide[]>([]);
  const [scriptStatus, setScriptStatus] = useState("");
  const [listening, setListening] = useState(false);
  const [mode, setMode] = useState<VoiceFollowState["mode"]>("paused");
  const [status, setStatus] = useState("Ready to follow your voice");
  const [heard, setHeard] = useState("");
  const [notes, setNotes] = useState<VoiceFollowNote[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const notesRef = useRef<VoiceFollowNote[]>([]);
  const recognitionRef = useRef<SpeechEngine | null>(null);
  const keepListeningRef = useRef(false);
  const restartRef = useRef<number | null>(null);
  const lastResultRef = useRef(0);
  const lastHeardRef = useRef(0);
  const lastPublishRef = useRef({ at: 0, index: -1, mode: "" });
  const alignRef = useRef(initialVoiceFollowState());
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const docRef = useRef(documentId);
  docRef.current = documentId;

  useEffect(() => {
    const browser = window as BrowserVoiceWindow;
    setAvailable(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    if (suppliedSlides || !documentId) return;
    let disposed = false;
    setRemoteSlides([]); // Never use the previous document for a new voice session.
    const load = async () => {
      setScriptStatus("Loading script for microphone…");
      const local = loadTeleprompterDocuments().find(doc => doc.id === documentId);
      if (local) {
        if (!disposed) {
          setRemoteSlides(parseTeleprompterDocument(local.content));
          setScriptStatus("");
        }
      }
      try {
        const cloud = await fetchCloudDocuments();
        const selected = cloud.find(doc => doc.id === documentId && !doc.deleted_at);
        if (selected && !disposed) {
          setRemoteSlides(parseTeleprompterDocument(fromCloud(selected).content));
          setScriptStatus("");
        } else if (!local && !disposed) setScriptStatus("This script is not available on your phone. Use the iPad microphone or sync it to the cloud.");
      } catch {
        if (!local && !disposed) setScriptStatus("Cloud script unavailable. You can use the iPad microphone.");
      }
    };
    void load();
    return () => { disposed = true; };
  }, [documentId, suppliedSlides]);

  const slides = suppliedSlides ?? remoteSlides;
  const deck = useMemo(() => createVoiceDeck(slides), [slides]);
  const deckRef = useRef(deck);
  deckRef.current = deck;

  useEffect(() => {
    const current = loadNotes(documentId ?? "");
    notesRef.current = current;
    setNotes(current);
    alignRef.current = initialVoiceFollowState();
  }, [documentId]);

  const remember = useCallback((next: VoiceFollowState) => {
    alignRef.current = next;
    setMode(next.mode);
    if (next.completedNotes.length) {
      const all = [...notesRef.current, ...next.completedNotes];
      notesRef.current = all;
      setNotes(all);
      saveNotes(docRef.current ?? "", all);
      alignRef.current = { ...next, completedNotes: [] };
    }
  }, []);

  const publish = useCallback((state: VoiceFollowState, force = false) => {
    const current = deckRef.current;
    const position = findDeckPosition(current, state.cursorWord);
    const now = Date.now();
    const last = lastPublishRef.current;
    if (!force && now - last.at < 420 && last.index === state.cursorWord && last.mode === state.mode) return;
    if (!force && now - last.at < 260) return;
    lastPublishRef.current = { at: now, index: state.cursorWord, mode: state.mode };
    dispatchRef.current({ type: "voiceFollow", slideIndex: position.slideIndex, wordIndex: position.wordIndex, mode: state.mode });
  }, []);

  const feedTranscript = useCallback((transcript: string, final: boolean) => {
    if (!keepListeningRef.current || !transcript.trim()) return;
    const now = Date.now();
    lastHeardRef.current = now;
    setHeard(transcript.trim().slice(-140));
    const next = advanceVoiceFollow(alignRef.current, { transcript, final, speaking: true, at: now }, deckRef.current.words);
    remember(next);
    publish(next, final);
    if (next.mode === "improvising") setStatus("Off script. Holding position and capturing notes.");
    else if (next.mode === "reacquiring") setStatus("Found script. Confirming the next phrase…");
    else if (next.mode === "paused") setStatus("Waiting. Resume speaking to continue.");
    else setStatus("Following your words");
  }, [publish, remember]);

  const stopCapture = useCallback((notify = true) => {
    keepListeningRef.current = false;
    if (restartRef.current !== null) window.clearTimeout(restartRef.current);
    restartRef.current = null;
    const engine = recognitionRef.current;
    recognitionRef.current = null;
    if (engine) {
      engine.onend = null;
      engine.onresult = null;
      engine.onerror = null;
      try { engine.stop(); } catch { /* Already stopped. */ }
    }
    remember(finishVoiceFollow(alignRef.current, Date.now()));
    setListening(false);
    setMode("paused");
    if (notify) dispatchRef.current({ type: "voiceStop" });
  }, [remember]);

  // If the presenter manually changes section or starts ordinary scrolling, release the microphone.
  useEffect(() => {
    if (keepListeningRef.current && session && !session.voiceActive) stopCapture(false);
  }, [session?.voiceActive, session, stopCapture]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!keepListeningRef.current) return;
      if (Date.now() - lastHeardRef.current > 1300 && alignRef.current.mode !== "paused") {
        const next = advanceVoiceFollow(alignRef.current, { transcript: "", final: false, speaking: false, at: Date.now() }, deckRef.current.words);
        remember(next);
        publish(next, true);
        setStatus("Waiting. Resume speaking to continue.");
      }
    }, 450);
    return () => window.clearInterval(timer);
  }, [publish, remember]);

  useEffect(() => () => {
    keepListeningRef.current = false;
    if (restartRef.current !== null) window.clearTimeout(restartRef.current);
    const engine = recognitionRef.current;
    if (engine) {
      engine.onend = null;
      engine.onresult = null;
      try { engine.abort(); } catch { /* Already closed. */ }
    }
  }, []);

  const begin = () => {
    if (available !== true || !deck.words.length || !session || keepListeningRef.current) return;
    const browser = window as BrowserVoiceWindow;
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) return;
    const prior = session.voiceActive ? (session.voiceWordIndex ?? 0) : 0;
    const startAt = deckCursorForPosition(deck, session.slideIndex, prior);
    alignRef.current = { ...initialVoiceFollowState(), cursorWord: startAt };
    keepListeningRef.current = true;
    setListening(true);
    setHeard("");
    setStatus("Requesting microphone access…");
    lastHeardRef.current = Date.now();
    dispatch({ type: "voiceFollow", slideIndex: session.slideIndex, wordIndex: prior, mode: "paused" });

    const open = () => {
      if (!keepListeningRef.current) return;
      const recognizer = new Constructor();
      recognitionRef.current = recognizer;
      lastResultRef.current = 0;
      recognizer.continuous = true;
      recognizer.interimResults = true;
      recognizer.maxAlternatives = 1;
      recognizer.lang = "en-US";
      recognizer.onstart = () => setStatus("Listening. Speak your script to begin.");
      recognizer.onresult = event => {
        // Safari may return the complete result collection repeatedly. Process finalized results once.
        for (let i = Math.max(lastResultRef.current, event.resultIndex); i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result?.[0]?.transcript?.trim() ?? "";
          if (!transcript) continue;
          if (result.isFinal) {
            feedTranscript(transcript, true);
            lastResultRef.current = Math.max(lastResultRef.current, i + 1);
          } else {
            feedTranscript(transcript, false);
          }
        }
      };
      recognizer.onspeechend = () => {
        // Safari may stop emitting interim results between natural sentences.
        // The silence timer owns the Waiting transition, never improvisation.
        lastHeardRef.current = Math.min(lastHeardRef.current, Date.now() - 800);
      };
      recognizer.onerror = event => {
        const terminal = ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"].includes(event.error);
        if (terminal) {
          setStatus("Microphone unavailable. Check Safari permissions and try again.");
          stopCapture();
        } else if (event.error === "network") {
          setStatus("Safari recognition lost its connection. Retry the microphone.");
          stopCapture();
        } else if (event.error !== "no-speech" && event.error !== "aborted") {
          setStatus(`Safari recognition: ${event.error}`);
        }
      };
      recognizer.onend = () => {
        if (!keepListeningRef.current) return;
        setStatus("Reconnecting Safari microphone…");
        restartRef.current = window.setTimeout(open, 600);
      };
      try { recognizer.start(); }
      catch {
        setStatus("Safari could not start recognition. Retry from this screen.");
        stopCapture();
      }
    };
    open();
  };

  const exportCaptured = () => exportNotes(documentId ?? "untitled", session?.title ?? "Teleprompter", notes);
  const pairedMicActive = !listening && Boolean(session?.voiceActive);
  const currentlyFollowing = listening || pairedMicActive;
  const displayedMode = listening ? mode : pairedMicActive ? session?.voiceMode ?? "paused" : "paused";
  const stateText = currentlyFollowing
    ? displayedMode === "following" ? "Following" :
      displayedMode === "improvising" ? "Holding" :
      displayedMode === "reacquiring" ? "Rejoining" : "Listening"
    : "Ready";
  if (available === null) return null;
  return (
    <section
      className={`tp-voice-panel ${compact ? "tp-voice-panel-compact" : ""} ${detailsOpen ? "is-expanded" : "is-minimized"}`}
      data-tp-mic-active={currentlyFollowing ? "true" : undefined}
      aria-label="Safari Voice Follow"
    >
      <div className="tp-voice-toolbar">
        <span className="tp-voice-signal" aria-hidden="true" />
        <div className="tp-voice-label">
          <strong>Voice Follow</strong>
          <span aria-live="polite">{available ? stateText : "Unavailable"}</span>
        </div>
        {available && (
          <button
            type="button"
            className={listening ? "tp-voice-stop" : "tp-voice-start"}
            onClick={listening ? () => stopCapture() : begin}
            disabled={!listening && (!session || !deck.words.length || pairedMicActive)}
            aria-label={listening ? "Stop voice following" : "Start voice following"}
          >
            {listening ? "Stop" : "Start"}
          </button>
        )}
        <button
          type="button"
          className="tp-voice-details-toggle"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen(value => !value)}
        >
          {detailsOpen ? "Less" : "Details"}
        </button>
      </div>
      {detailsOpen && (
        <div className="tp-voice-details">
          {!available && <p className="tp-voice-alert">Safari speech recognition isn't supported here. Open the page directly in Safari and use the manual controls.</p>}
          <p className="tp-voice-status" role="status">
            {pairedMicActive
              ? "The paired device is following speech. To take over, stop that microphone or navigate manually."
              : scriptStatus || status}
          </p>
          {listening && heard && <p className="tp-voice-heard" aria-label="Last recognized speech">“{heard}”</p>}
          {notes.length > 0 && (
            <button type="button" className="tp-voice-export" onClick={exportCaptured}>
              Export captured notes ({notes.length})
            </button>
          )}
          <p className="tp-voice-caption">
            Keep Safari in the foreground. Improvisation notes are saved locally on this device until exported.
            Scripture references need review.
          </p>
        </div>
      )}
      {!detailsOpen && notes.length > 0 && !compact && (
        <button type="button" className="tp-voice-notes-link" onClick={exportCaptured}>
          Export {notes.length} captured note{notes.length === 1 ? "" : "s"}
        </button>
      )}
    </section>
  );
}

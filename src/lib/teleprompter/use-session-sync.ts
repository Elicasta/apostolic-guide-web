"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  broadcastTeleprompterState,
  closeTeleprompterChannel,
  createLocalTeleprompterChannel,
  createTeleprompterChannel,
  fetchTeleprompterState,
  makeTeleprompterActorId,
  normalizeSessionCode,
  persistTeleprompterState,
} from "./realtime";
import {
  applyCanonicalDeck,
  applyTeleprompterAction,
  isTeleprompterSessionState,
  normalizeTeleprompterState,
  shouldAcceptTeleprompterState,
} from "./session-state";
import type {
  TeleprompterAction,
  TeleprompterConnection,
  TeleprompterSessionState,
} from "./types";

interface SessionSyncOptions {
  sessionCode: string;
  role: "display" | "remote";
  initialState?: TeleprompterSessionState | null;
  canonicalDeck?: TeleprompterSessionState | null;
}

const RECOVERY_INTERVAL_MS = 1800;
const VOICE_CHECKPOINT_MS = 2200;

export function useTeleprompterSessionSync({
  sessionCode,
  role,
  initialState = null,
  canonicalDeck = null,
}: SessionSyncOptions) {
  const normalizedCode = normalizeSessionCode(sessionCode);
  const [state, setState] = useState<TeleprompterSessionState | null>(
    initialState ? normalizeTeleprompterState(initialState) : null,
  );
  const [connection, setConnection] =
    useState<TeleprompterConnection>("idle");
  const stateRef = useRef(state);
  const canonicalRef = useRef(canonicalDeck);
  const channelRef = useRef<ReturnType<typeof createTeleprompterChannel>>(null);
  const localChannelRef = useRef<BroadcastChannel | null>(null);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const lastVoiceCheckpointRef = useRef(0);
  const pendingVoiceCheckpointRef = useRef<TeleprompterSessionState | null>(null);
  const voiceCheckpointTimerRef = useRef<number | null>(null);
  const actorIdRef = useRef(makeTeleprompterActorId(role));
  const publishRef = useRef<(state: TeleprompterSessionState) => void>(() => undefined);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    canonicalRef.current = canonicalDeck;
  }, [canonicalDeck]);

  const acceptIncoming = useCallback((value: unknown) => {
    if (!isTeleprompterSessionState(value)) return false;
    const validated = normalizeTeleprompterState(value);
    const canonical = canonicalRef.current;
    const deckMismatch = Boolean(
      canonical &&
        (validated.documentId !== canonical.documentId ||
          validated.slides.length !== canonical.slides.length ||
          validated.slides.some(
            (slide, index) => slide.id !== canonical.slides[index]?.id,
          )),
    );
    const incoming = canonical
      ? applyCanonicalDeck(validated, canonical)
      : validated;
    const accepted = deckMismatch
      ? normalizeTeleprompterState({
          ...incoming,
          sequence: incoming.sequence + 1,
          updatedAt: Date.now(),
          actorId: actorIdRef.current,
        })
      : incoming;

    if (!shouldAcceptTeleprompterState(stateRef.current, accepted)) return false;
    stateRef.current = accepted;
    setState(accepted);
    if (deckMismatch) {
      window.queueMicrotask(() => publishRef.current(accepted));
    }
    return true;
  }, []);

  const queueCheckpoint = useCallback((snapshot: TeleprompterSessionState) => {
    // A single ordered persistence chain for recovery snapshots, never per interim word.
    writeChainRef.current = writeChainRef.current.catch(() => undefined).then(async () => {
      try {
        await persistTeleprompterState(normalizedCode, snapshot);
        setConnection("live");
      } catch {
        setConnection(channelRef.current ? "recovering" : "offline");
      }
    });
  }, [normalizedCode]);

  const publish = useCallback(
    (nextState: TeleprompterSessionState, voiceEvent = false) => {
      if (!normalizedCode) return;
      const normalized = normalizeTeleprompterState(nextState);
      stateRef.current = normalized;
      setState(normalized);
      localChannelRef.current?.postMessage(normalized);

      // Live mic position broadcasts must never wait for network persistence.
      // Reordering is safe because listeners validate monotonically increasing sequences.
      if (channelRef.current) {
        void broadcastTeleprompterState(channelRef.current, normalized).catch(() => {
          setConnection("recovering");
        });
      }

      if (voiceEvent) {
        pendingVoiceCheckpointRef.current = normalized;
        if (!voiceCheckpointTimerRef.current) {
          const wait = Math.max(0, VOICE_CHECKPOINT_MS - (Date.now() - lastVoiceCheckpointRef.current));
          voiceCheckpointTimerRef.current = window.setTimeout(() => {
            voiceCheckpointTimerRef.current = null;
            const latest = pendingVoiceCheckpointRef.current;
            pendingVoiceCheckpointRef.current = null;
            if (latest) {
              lastVoiceCheckpointRef.current = Date.now();
              queueCheckpoint(latest);
            }
          }, wait);
        }
        return;
      }

      // Cancel scheduled stale voice saves. A manual action / Stop flushes
      // the latest authoritative state and cannot be undone by older mic snapshots.
      pendingVoiceCheckpointRef.current = null;
      if (voiceCheckpointTimerRef.current !== null) {
        window.clearTimeout(voiceCheckpointTimerRef.current);
        voiceCheckpointTimerRef.current = null;
      }
      queueCheckpoint(normalized);
    },
    [normalizedCode, queueCheckpoint],
  );

  const dispatch = useCallback(
    (action: TeleprompterAction) => {
      const current = stateRef.current;
      if (!current) return;
      publish(
        applyTeleprompterAction(
          current,
          action,
          actorIdRef.current,
          Date.now(),
        ),
        action.type === "voiceFollow",
      );
    },
    [publish],
  );

  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);

  useEffect(() => {
    if (!initialState) return;
    const next = normalizeTeleprompterState(initialState);
    const current = stateRef.current;
    if (
      current &&
      current.documentId === next.documentId &&
      current.slides.length === next.slides.length
    ) {
      return;
    }
    stateRef.current = next;
    setState(next);
  }, [initialState]);

  useEffect(() => {
    if (!normalizedCode) {
      setConnection("idle");
      return;
    }

    let disposed = false;
    setConnection("connecting");

    const localChannel = createLocalTeleprompterChannel(normalizedCode);
    localChannelRef.current = localChannel;
    if (localChannel) {
      localChannel.onmessage = (event) => acceptIncoming(event.data);
    }

    const realtimeChannel = createTeleprompterChannel(normalizedCode);
    channelRef.current = realtimeChannel;
    realtimeChannel
      ?.on("broadcast", { event: "state" }, ({ payload }) => {
        acceptIncoming(payload);
      })
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") setConnection("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection("recovering");
        }
        if (status === "CLOSED") setConnection("offline");
      });

    const recover = async () => {
      try {
        const latest = await fetchTeleprompterState(normalizedCode);
        if (disposed) return;
        if (latest) {
          acceptIncoming(latest);
        } else if (stateRef.current) {
          const seeded = {
            ...stateRef.current,
            sequence: stateRef.current.sequence + 1,
            updatedAt: Date.now(),
            actorId: actorIdRef.current,
          };
          publish(seeded);
        }
      } catch {
        if (!disposed) setConnection(realtimeChannel ? "recovering" : "offline");
      }
    };

    void recover();
    const recoveryTimer = window.setInterval(recover, RECOVERY_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(recoveryTimer);
      if (voiceCheckpointTimerRef.current !== null) {
        window.clearTimeout(voiceCheckpointTimerRef.current);
        voiceCheckpointTimerRef.current = null;
      }
      const latestVoiceState = pendingVoiceCheckpointRef.current;
      pendingVoiceCheckpointRef.current = null;
      if (latestVoiceState) queueCheckpoint(latestVoiceState);
      localChannel?.close();
      localChannelRef.current = null;
      channelRef.current = null;
      void closeTeleprompterChannel(realtimeChannel);
    };
  }, [acceptIncoming, normalizedCode, publish]);

  return { state, connection, dispatch, publish };
}

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

  const publish = useCallback(
    (nextState: TeleprompterSessionState) => {
      if (!normalizedCode) return;
      const normalized = normalizeTeleprompterState(nextState);
      stateRef.current = normalized;
      setState(normalized);
      localChannelRef.current?.postMessage(normalized);

      writeChainRef.current = writeChainRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await Promise.all([
              channelRef.current
                ? broadcastTeleprompterState(channelRef.current, normalized)
                : Promise.resolve(),
              persistTeleprompterState(normalizedCode, normalized),
            ]);
            setConnection("live");
          } catch {
            setConnection(channelRef.current ? "recovering" : "offline");
          }
        });
    },
    [normalizedCode],
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
      localChannel?.close();
      localChannelRef.current = null;
      channelRef.current = null;
      void closeTeleprompterChannel(realtimeChannel);
    };
  }, [acceptIncoming, normalizedCode, publish]);

  return { state, connection, dispatch, publish };
}

import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  isTeleprompterSessionState,
  normalizeTeleprompterState,
} from "./session-state";
import type { TeleprompterSessionState } from "./types";

const SESSION_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let client: SupabaseClient | null | undefined;

export function normalizeSessionCode(value: string | null | undefined) {
  return (value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

export function makeSessionCode(length = 9) {
  let code = "";
  const bytes = new Uint8Array(length);

  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) code += SESSION_CHARS[byte % SESSION_CHARS.length];
    return code;
  }

  for (let index = 0; index < length; index += 1) {
    code += SESSION_CHARS[Math.floor(Math.random() * SESSION_CHARS.length)];
  }
  return code;
}

export function makeTeleprompterActorId(role: "display" | "remote") {
  const suffix = makeSessionCode(8).toLowerCase();
  return `${role}:${suffix}`;
}

export function getTeleprompterRealtimeClient() {
  if (client !== undefined) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    client = null;
    return client;
  }

  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 20 },
    },
  });

  return client;
}

export function createTeleprompterChannel(sessionCode: string) {
  const supabase = getTeleprompterRealtimeClient();
  if (!supabase) return null;

  return supabase.channel(`teleprompter:${normalizeSessionCode(sessionCode)}`, {
    config: {
      broadcast: { self: false },
    },
  });
}

export function createLocalTeleprompterChannel(sessionCode: string) {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(
    `ag-teleprompter:${normalizeSessionCode(sessionCode)}`,
  );
}

export async function broadcastTeleprompterState(
  channel: RealtimeChannel,
  state: TeleprompterSessionState,
) {
  await channel.send({
    type: "broadcast",
    event: "state",
    payload: normalizeTeleprompterState(state),
  });
}

export async function persistTeleprompterState(
  sessionCode: string,
  state: TeleprompterSessionState,
) {
  const response = await fetch("/api/teleprompter/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionCode: normalizeSessionCode(sessionCode),
      state: normalizeTeleprompterState(state),
    }),
  });

  if (!response.ok) {
    throw new Error(`Session write failed (${response.status})`);
  }
}

export async function fetchTeleprompterState(sessionCode: string) {
  const response = await fetch(
    `/api/teleprompter/session?session=${encodeURIComponent(
      normalizeSessionCode(sessionCode),
    )}`,
    { cache: "no-store" },
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Session read failed (${response.status})`);

  const payload = (await response.json()) as { state?: unknown };
  return isTeleprompterSessionState(payload.state)
    ? normalizeTeleprompterState(payload.state)
    : null;
}

export async function closeTeleprompterChannel(channel: RealtimeChannel | null) {
  if (!channel) return;
  const supabase = getTeleprompterRealtimeClient();
  if (supabase) await supabase.removeChannel(channel);
}

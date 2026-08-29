import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { TeleprompterCommand, TeleprompterSessionState } from "./types";

const SESSION_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let client: SupabaseClient | null | undefined;

export function normalizeSessionCode(value: string | null | undefined) {
  return (value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

export function makeSessionCode(length = 7) {
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

export function getTeleprompterRealtimeClient() {
  if (client !== undefined) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

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

export async function sendTeleprompterCommand(
  channel: RealtimeChannel,
  command: TeleprompterCommand,
) {
  await channel.send({ type: "broadcast", event: "command", payload: command });
}

export async function sendTeleprompterState(
  channel: RealtimeChannel,
  state: TeleprompterSessionState,
) {
  await channel.send({ type: "broadcast", event: "state", payload: state });
}

export async function requestTeleprompterState(channel: RealtimeChannel) {
  await channel.send({ type: "broadcast", event: "request-state", payload: {} });
}

export async function closeTeleprompterChannel(channel: RealtimeChannel | null) {
  if (!channel) return;
  const supabase = getTeleprompterRealtimeClient();
  if (supabase) await supabase.removeChannel(channel);
}

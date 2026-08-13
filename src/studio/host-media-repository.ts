import { createHash } from "node:crypto";
import { createServiceClient } from "@/supabase";
import { StudioPersistenceError } from "./repository";

function db() {
  const client = createServiceClient();
  if (!client) throw new StudioPersistenceError("AG Studio persistence is not configured. Add the Supabase service credentials first.");
  return client;
}

function hashOutputToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function saveHostOffer(sessionId: string, offerSdp: string) {
  const client = db();
  const { data: current } = await client.from("studio_host_media_signals").select("signal_version").eq("session_id", sessionId).maybeSingle();
  const signalVersion = Number(current?.signal_version ?? 0) + 1;
  const { data, error } = await client.from("studio_host_media_signals").upsert({ session_id: sessionId, offer_sdp: offerSdp, answer_sdp: null, signal_version: signalVersion }, { onConflict: "session_id" }).select("*").single();
  if (error) throw new StudioPersistenceError(error.message);
  return data;
}

export async function getHostSignalForProducer(sessionId: string) {
  const { data, error } = await db().from("studio_host_media_signals").select("offer_sdp, answer_sdp, signal_version, updated_at").eq("session_id", sessionId).maybeSingle();
  if (error) throw new StudioPersistenceError(error.message);
  return data;
}

export async function getHostSignalForOutput(sessionId: string, token: string) {
  const client = db();
  const { data: session, error: sessionError } = await client.from("studio_sessions").select("output_token_hash").eq("id", sessionId).maybeSingle();
  if (sessionError) throw new StudioPersistenceError(sessionError.message);
  if (!session?.output_token_hash || session.output_token_hash !== hashOutputToken(token)) return null;
  const { data, error } = await client.from("studio_host_media_signals").select("offer_sdp, answer_sdp, signal_version, updated_at").eq("session_id", sessionId).maybeSingle();
  if (error) throw new StudioPersistenceError(error.message);
  return data ?? { offer_sdp: null, answer_sdp: null, signal_version: 0, updated_at: null };
}

export async function saveHostAnswerFromOutput(sessionId: string, token: string, answerSdp: string, signalVersion: number) {
  const client = db();
  const { data: session, error: sessionError } = await client.from("studio_sessions").select("output_token_hash").eq("id", sessionId).maybeSingle();
  if (sessionError) throw new StudioPersistenceError(sessionError.message);
  if (!session?.output_token_hash || session.output_token_hash !== hashOutputToken(token)) return null;
  const { data, error } = await client.from("studio_host_media_signals").update({ answer_sdp: answerSdp }).eq("session_id", sessionId).eq("signal_version", signalVersion).select("*").maybeSingle();
  if (error) throw new StudioPersistenceError(error.message);
  return data;
}

import { createServiceClient } from "./supabase";
import { getInstagramConfig, parseInstagramWebhook } from "./social-messaging";
import { recordPersonEvent, upsertInstagramPerson } from "./people-crm";

export type InboxStatus = "open" | "follow_up" | "resolved" | "archived";

async function ensureConversation(personId: string, at: string, inbound = false) {
  const service = createServiceClient();
  if (!service) return null;
  const existing = await service.from("inbox_conversations").select("*").eq("platform", "instagram").eq("person_id", personId).maybeSingle();
  if (existing.data) {
    const updates: Record<string, unknown> = { last_message_at: at, updated_at: new Date().toISOString() };
    if (inbound) {
      updates.last_inbound_at = at;
      updates.unread_count = Number(existing.data.unread_count ?? 0) + 1;
      if (existing.data.status === "resolved" || existing.data.status === "archived") updates.status = "open";
    } else updates.last_outbound_at = at;
    const result = await service.from("inbox_conversations").update(updates).eq("id", existing.data.id).select("*").single();
    return result.data;
  }
  const result = await service.from("inbox_conversations").insert({ person_id: personId, platform: "instagram", status: "open", unread_count: inbound ? 1 : 0, last_message_at: at, last_inbound_at: inbound ? at : null, last_outbound_at: inbound ? null : at }).select("*").single();
  return result.data;
}

export async function ingestInstagramInbox(payload: unknown) {
  const service = createServiceClient();
  if (!service) return 0;
  const triggers = parseInstagramWebhook(payload).filter((trigger) => trigger.triggerType === "dm_keyword" && trigger.senderId);
  let stored = 0;
  for (const trigger of triggers) {
    const externalEventId = `inbox:${trigger.externalEventId}`;
    const duplicate = await service.from("inbox_messages").select("id").eq("external_event_id", externalEventId).maybeSingle();
    if (duplicate.data) continue;
    const person = await upsertInstagramPerson({ instagramUserId: trigger.senderId, sourceDetail: "instagram_dm", seenAt: trigger.eventAt });
    if (!person) continue;
    const conversation = await ensureConversation(person.id, trigger.eventAt, true);
    if (!conversation) continue;
    const { error } = await service.from("inbox_messages").insert({ conversation_id: conversation.id, person_id: person.id, platform: "instagram", direction: "inbound", kind: "text", body: trigger.text.slice(0, 10000), provider_message_id: trigger.externalEventId.replace(/^message:/, ""), external_event_id: externalEventId, delivery_status: "received", sent_at: trigger.eventAt, metadata: {} });
    if (!error) stored += 1;
  }
  return stored;
}

export async function recordInboxOutbound(input: { personId: string; body: string; providerMessageId?: string | null; externalEventId?: string | null; kind?: "text" | "automation"; at?: string; metadata?: Record<string, unknown> }) {
  const service = createServiceClient();
  if (!service) return;
  if (input.externalEventId) {
    const existing = await service.from("inbox_messages").select("id").eq("external_event_id", input.externalEventId).maybeSingle();
    if (existing.data) return;
  }
  const at = input.at ?? new Date().toISOString();
  const conversation = await ensureConversation(input.personId, at, false);
  if (!conversation) return;
  await service.from("inbox_messages").insert({ conversation_id: conversation.id, person_id: input.personId, platform: "instagram", direction: "outbound", kind: input.kind ?? "text", body: input.body.slice(0, 10000), provider_message_id: input.providerMessageId ?? null, external_event_id: input.externalEventId ?? null, delivery_status: "sent", sent_at: at, metadata: input.metadata ?? {} });
}

export async function listInboxConversations(status?: InboxStatus | "all") {
  const service = createServiceClient();
  if (!service) return [];
  let query = service.from("inbox_conversations").select("id,person_id,status,unread_count,last_message_at,last_inbound_at,last_outbound_at,people(id,display_name,instagram_username,email,status)").order("last_message_at", { ascending: false }).limit(100);
  if (status && status !== "all") query = query.eq("status", status);
  const { data } = await query;
  return data ?? [];
}

export async function getInboxConversation(id: string) {
  const service = createServiceClient();
  if (!service) return null;
  const [conversation, messages] = await Promise.all([
    service.from("inbox_conversations").select("*,people(id,display_name,instagram_username,email,status)").eq("id", id).maybeSingle(),
    service.from("inbox_messages").select("*").eq("conversation_id", id).order("sent_at", { ascending: true }).limit(300)
  ]);
  if (!conversation.data) return null;
  return { conversation: conversation.data, messages: messages.data ?? [] };
}

export async function markConversationRead(id: string) {
  const service = createServiceClient();
  if (!service) return;
  await service.from("inbox_conversations").update({ unread_count: 0, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function updateConversationStatus(id: string, status: InboxStatus) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  await service.from("inbox_conversations").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
}

export function instagramReplyWindowOpen(lastInboundAt: string | null | undefined) {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000;
}

export async function sendManualInstagramReply(conversationId: string, body: string) {
  const service = createServiceClient();
  const config = await getInstagramConfig();
  if (!service || !config) throw new Error("Instagram is not configured.");
  const { data: conversation } = await service.from("inbox_conversations").select("id,person_id,last_inbound_at,people(instagram_user_id)").eq("id", conversationId).single();
  if (!conversation) throw new Error("Conversation not found.");
  if (!instagramReplyWindowOpen(conversation.last_inbound_at)) throw new Error("Instagram reply window is closed. Wait for the person to message again before replying.");
  const personRaw = conversation.people as unknown as { instagram_user_id?: string | null } | null;
  const recipientId = personRaw?.instagram_user_id;
  if (!recipientId) throw new Error("This person has no Instagram recipient ID.");
  const response = await fetch(`https://graph.instagram.com/${config.graphVersion}/${encodeURIComponent(config.instagramUserId)}/messages`, { method: "POST", headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: recipientId }, message: { text: body.trim() } }), cache: "no-store" });
  const json = await response.json().catch(() => ({})) as { message_id?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? `Instagram send failed (${response.status}).`);
  const now = new Date().toISOString();
  await recordInboxOutbound({ personId: conversation.person_id, body, providerMessageId: json.message_id ?? null, externalEventId: json.message_id ? `manual:${json.message_id}` : null, kind: "text", at: now });
  await recordPersonEvent({ personId: conversation.person_id, eventType: "manual_reply_sent", channel: "instagram", eventName: "Manual Instagram reply sent", externalEventId: json.message_id ? `crm:manual:${json.message_id}` : undefined, metadata: {}, occurredAt: now });
  return json.message_id ?? null;
}

import { createServiceClient } from "./supabase";
import { getInstagramConfig, parseInstagramWebhook } from "./social-messaging";
import { recordPersonEvent, upsertEmailPerson, upsertInstagramPerson } from "./people-crm";
import { buildApostolicEmail, escapeEmailHtml } from "./email-design";

export type InboxStatus = "open" | "follow_up" | "resolved" | "archived";
export type InboxPlatform = "instagram" | "website";

async function ensureConversation(personId: string, platform: InboxPlatform, at: string, inbound = false) {
  const service = createServiceClient();
  if (!service) return null;
  const existing = await service.from("inbox_conversations").select("*").eq("platform", platform).eq("person_id", personId).maybeSingle();
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
  const result = await service.from("inbox_conversations").insert({ person_id: personId, platform, status: "open", unread_count: inbound ? 1 : 0, last_message_at: at, last_inbound_at: inbound ? at : null, last_outbound_at: inbound ? null : at }).select("*").single();
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
    const conversation = await ensureConversation(person.id, "instagram", trigger.eventAt, true);
    if (!conversation) continue;
    const { error } = await service.from("inbox_messages").insert({ conversation_id: conversation.id, person_id: person.id, platform: "instagram", direction: "inbound", kind: "text", body: trigger.text.slice(0, 10000), provider_message_id: trigger.externalEventId.replace(/^message:/, ""), external_event_id: externalEventId, delivery_status: "received", sent_at: trigger.eventAt, metadata: {} });
    if (!error) stored += 1;
  }
  return stored;
}

export async function recordWebsiteContactSubmission(input: {
  referenceId: string;
  name: string;
  email: string;
  location: string;
  category: string;
  context?: string;
  question: string;
  path?: string;
}) {
  const service = createServiceClient();
  if (!service) return null;
  const at = new Date().toISOString();
  const person = await upsertEmailPerson({ email: input.email, displayName: input.name, sourceDetail: "contact_form", seenAt: at });
  if (!person) return null;
  const externalEventId = `contact:${input.referenceId}`;
  const duplicate = await service.from("inbox_messages").select("conversation_id").eq("external_event_id", externalEventId).maybeSingle();
  if (duplicate.data?.conversation_id) return { conversationId: duplicate.data.conversation_id, personId: person.id };
  const conversation = await ensureConversation(person.id, "website", at, true);
  if (!conversation) return null;
  const { error } = await service.from("inbox_messages").insert({
    conversation_id: conversation.id,
    person_id: person.id,
    platform: "website",
    direction: "inbound",
    kind: "text",
    body: input.question.slice(0, 10000),
    provider_message_id: input.referenceId,
    external_event_id: externalEventId,
    delivery_status: "received",
    sent_at: at,
    metadata: {
      reference_id: input.referenceId,
      category: input.category,
      location: input.location,
      context: input.context || null,
      path: input.path || "/contact"
    }
  });
  if (error) throw new Error(`Could not store contact submission: ${error.message}`);
  await recordPersonEvent({ personId: person.id, eventType: "contact_form_submitted", channel: "website", eventName: "Website contact form", externalEventId: `crm:${externalEventId}`, metadata: { category: input.category, reference_id: input.referenceId }, occurredAt: at });
  return { conversationId: conversation.id, personId: person.id };
}

export async function recordInboxOutbound(input: { personId: string; platform?: InboxPlatform; body: string; providerMessageId?: string | null; externalEventId?: string | null; kind?: "text" | "automation"; at?: string; metadata?: Record<string, unknown> }) {
  const service = createServiceClient();
  if (!service) return;
  if (input.externalEventId) {
    const existing = await service.from("inbox_messages").select("id").eq("external_event_id", input.externalEventId).maybeSingle();
    if (existing.data) return;
  }
  const at = input.at ?? new Date().toISOString();
  const platform = input.platform ?? "instagram";
  const conversation = await ensureConversation(input.personId, platform, at, false);
  if (!conversation) return;
  await service.from("inbox_messages").insert({ conversation_id: conversation.id, person_id: input.personId, platform, direction: "outbound", kind: input.kind ?? "text", body: input.body.slice(0, 10000), provider_message_id: input.providerMessageId ?? null, external_event_id: input.externalEventId ?? null, delivery_status: "sent", sent_at: at, metadata: input.metadata ?? {} });
}

export async function listInboxConversations(status?: InboxStatus | "all", platform?: InboxPlatform | "all") {
  const service = createServiceClient();
  if (!service) return [];
  let query = service.from("inbox_conversations").select("id,person_id,platform,provider_thread_id,status,unread_count,last_message_at,last_inbound_at,last_outbound_at,people(id,display_name,instagram_username,email,status)").order("last_message_at", { ascending: false }).limit(150);
  if (status && status !== "all") query = query.eq("status", status);
  if (platform && platform !== "all") query = query.eq("platform", platform);
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
  await recordInboxOutbound({ personId: conversation.person_id, platform: "instagram", body, providerMessageId: json.message_id ?? null, externalEventId: json.message_id ? `manual:${json.message_id}` : null, kind: "text", at: now });
  await recordPersonEvent({ personId: conversation.person_id, eventType: "manual_reply_sent", channel: "instagram", eventName: "Manual Instagram reply sent", externalEventId: json.message_id ? `crm:manual:${json.message_id}` : undefined, metadata: {}, occurredAt: now });
  return json.message_id ?? null;
}

async function sendManualWebsiteReply(conversationId: string, body: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Email sending is not configured.");
  const { data: conversation } = await service.from("inbox_conversations").select("id,person_id,people(display_name,email)").eq("id", conversationId).eq("platform", "website").single();
  if (!conversation) throw new Error("Website conversation not found.");
  const person = conversation.people as unknown as { display_name?: string | null; email?: string | null } | null;
  if (!person?.email) throw new Error("This person has no email address.");
  const latest = await service.from("inbox_messages").select("metadata").eq("conversation_id", conversationId).eq("direction", "inbound").order("sent_at", { ascending: false }).limit(1).maybeSingle();
  const metadata = (latest.data?.metadata ?? {}) as Record<string, unknown>;
  const reference = typeof metadata.reference_id === "string" ? metadata.reference_id : null;
  const category = typeof metadata.category === "string" ? metadata.category : "Your message to Apostolic Guide";
  const safeBody = escapeEmailHtml(body.trim()).replace(/\n/g, "<br>");
  const designed = buildApostolicEmail({
    subject: `${reference ? `[${reference}] ` : ""}A reply from Apostolic Guide`,
    previewText: body.trim().slice(0, 140),
    eyebrow: "Apostolic Guide · Reply",
    title: category,
    intro: person.display_name ? `Hello ${person.display_name.split(" ")[0]},` : "Thank you for writing to us.",
    bodyHtml: `<p style="margin:0;font-size:17px;line-height:29px;color:#46565d;">${safeBody}</p>`,
    cta: { label: "Continue studying", url: "https://apostolicguide.com" },
    footerNote: "Thank you for studying Scripture with Apostolic Guide."
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [person.email], subject: designed.subject, html: designed.html, text: body.trim() })
  });
  const json = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok) throw new Error(json.message ?? `Email send failed (${response.status}).`);
  const now = new Date().toISOString();
  await recordInboxOutbound({ personId: conversation.person_id, platform: "website", body, providerMessageId: json.id ?? null, externalEventId: json.id ? `website-reply:${json.id}` : undefined, kind: "text", at: now, metadata: { reference_id: reference, channel: "email" } });
  await recordPersonEvent({ personId: conversation.person_id, eventType: "manual_reply_sent", channel: "email", eventName: "Website form reply sent", externalEventId: json.id ? `crm:website-reply:${json.id}` : undefined, metadata: { reference_id: reference }, occurredAt: now });
  return json.id ?? null;
}

export async function sendManualInboxReply(conversationId: string, body: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const { data } = await service.from("inbox_conversations").select("platform").eq("id", conversationId).maybeSingle();
  if (!data) throw new Error("Conversation not found.");
  if (data.platform === "website") return { messageId: await sendManualWebsiteReply(conversationId, body), channel: "email" as const };
  return { messageId: await sendManualInstagramReply(conversationId, body), channel: "instagram" as const };
}

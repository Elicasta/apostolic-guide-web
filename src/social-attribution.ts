import { buildSocialReply, findMatchingAutomation, getInstagramConfig, listSocialAutomations, parseInstagramWebhook } from "./social-messaging";
import { createServiceClient } from "./supabase";
import { recordPersonEvent, upsertInstagramPerson } from "./people-crm";
import { recordInboxOutbound } from "./inbox";
import { buildStudyCardMessage, buildStudyHandshake, buildStudyIntroText, isOpenStudyReply, studyTitleFromDestination } from "./social-signature-flow";
import { attributedDestination } from "./social-attribution-url";
import { enqueueInstagramCommentGuide } from "./comment-guide-runtime";

export { attributedDestination } from "./social-attribution-url";

async function graphFetch(path: string, accessToken: string, graphVersion: string, init?: RequestInit) {
  const response = await fetch(`https://graph.instagram.com/${graphVersion}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store"
  });
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const metaError = typeof json.error === "object" && json.error
      ? json.error as Record<string, unknown>
      : null;
    const message = metaError && "message" in metaError
      ? String(metaError.message ?? `Meta request failed (${response.status}).`)
      : `Meta request failed (${response.status}).`;
    const code = metaError?.code != null ? ` code=${String(metaError.code)}` : "";
    const subcode = metaError?.error_subcode != null ? ` subcode=${String(metaError.error_subcode)}` : "";
    throw new Error(`${message}${code}${subcode}`);
  }
  return json;
}

async function sendInstagramMessage(config: NonNullable<Awaited<ReturnType<typeof getInstagramConfig>>>, recipientId: string, message: Record<string, unknown>) {
  return graphFetch(`${encodeURIComponent(config.instagramUserId)}/messages`, config.accessToken, config.graphVersion, {
    method: "POST",
    body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: "RESPONSE", message })
  });
}

async function deliverPendingStudyCard(input: {
  config: NonNullable<Awaited<ReturnType<typeof getInstagramConfig>>>;
  personId: string;
  recipientId: string;
  inboundExternalEventId: string;
  eventAt: string;
}) {
  const service = createServiceClient();
  if (!service) return null;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: sourceEvent } = await service.from("social_events")
    .select("id,automation_id,matched_keyword,destination_url,source_media_id,event_at")
    .eq("person_id", input.personId)
    .eq("trigger_type", "comment_keyword")
    .eq("delivery_status", "sent")
    .not("destination_url", "is", null)
    .gte("event_at", sevenDaysAgo)
    .order("event_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sourceEvent?.destination_url) return null;

  const { data: automation } = sourceEvent.automation_id
    ? await service.from("social_automations").select("id,name").eq("id", sourceEvent.automation_id).maybeSingle()
    : { data: null } as { data: null };
  const destinationUrl = String(sourceEvent.destination_url);
  const title = studyTitleFromDestination(destinationUrl, typeof automation?.name === "string" ? automation.name.replace(/[!]+$/g, "") : "Apostolic Guide Study");
  const introText = buildStudyIntroText();

  const intro = await sendInstagramMessage(input.config, input.recipientId, { text: introText });
  const introMessageId = typeof intro.message_id === "string" ? intro.message_id : null;
  const card = await sendInstagramMessage(input.config, input.recipientId, buildStudyCardMessage({ title, destinationUrl }));
  const cardMessageId = typeof card.message_id === "string" ? card.message_id : null;

  await service.from("social_events").insert({
    external_event_id: input.inboundExternalEventId,
    automation_id: sourceEvent.automation_id,
    trigger_type: "dm_keyword",
    matched_keyword: "OPEN",
    source_media_id: sourceEvent.source_media_id,
    person_id: input.personId,
    destination_url: destinationUrl,
    delivery_status: "sent",
    provider_message_id: cardMessageId,
    event_at: input.eventAt
  });

  await Promise.all([
    recordPersonEvent({
      personId: input.personId,
      eventType: "study_card_delivered",
      channel: "instagram",
      eventName: `${title} study delivered`,
      automationId: sourceEvent.automation_id,
      externalEventId: `crm:study-card:${input.inboundExternalEventId}`,
      metadata: { source_event_id: sourceEvent.id, destination_url: destinationUrl, matched_keyword: sourceEvent.matched_keyword },
      occurredAt: input.eventAt
    }),
    recordInboxOutbound({
      personId: input.personId,
      body: introText,
      providerMessageId: introMessageId,
      externalEventId: `study-intro:${input.inboundExternalEventId}`,
      kind: "automation",
      at: input.eventAt,
      metadata: { automation_id: sourceEvent.automation_id, source_event_id: sourceEvent.id, signature_flow: "you-found-the-study" }
    }),
    recordInboxOutbound({
      personId: input.personId,
      body: `Study link · ${title}\n${destinationUrl}`,
      providerMessageId: cardMessageId,
      externalEventId: `study-card:${input.inboundExternalEventId}`,
      kind: "automation",
      at: input.eventAt,
      metadata: { automation_id: sourceEvent.automation_id, source_event_id: sourceEvent.id, signature_flow: "you-found-the-study" }
    })
  ]);

  return { title, destinationUrl, providerMessageId: cardMessageId };
}

export async function processInstagramWebhookAttributed(payload: unknown) {
  const config = await getInstagramConfig();
  const service = createServiceClient();
  if (!config || !service) return { processed: 0, sent: 0, queued: 0 };
  const triggers = parseInstagramWebhook(payload);
  if (!triggers.length) return { processed: 0, sent: 0, queued: 0 };

  await service.from("social_connection_status").upsert({ platform: "instagram", last_webhook_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "platform" });
  const automations = await listSocialAutomations();
  let sent = 0;
  let queued = 0;

  for (const trigger of triggers) {
    const existing = await service.from("social_events").select("id").eq("external_event_id", trigger.externalEventId).maybeSingle();
    if (existing.data) continue;

    if (trigger.triggerType === "comment_keyword") {
      if (trigger.senderId === config.instagramUserId) {
        await service.from("social_events").insert({ external_event_id: trigger.externalEventId, trigger_type: "comment_keyword", source_media_id: trigger.mediaId, delivery_status: "ignored", error_code: "Ignored the connected account's own comment", event_at: trigger.eventAt });
        continue;
      }
      const person = trigger.senderId ? await upsertInstagramPerson({ instagramUserId: trigger.senderId, username: trigger.senderUsername, sourceDetail: "instagram_comment", seenAt: trigger.eventAt }) : null;
      const enqueued = await enqueueInstagramCommentGuide({ trigger, personId: person?.id ?? null });
      if (enqueued.queued) queued += 1;
      continue;
    }

    const person = trigger.senderId ? await upsertInstagramPerson({ instagramUserId: trigger.senderId, sourceDetail: "instagram_dm", seenAt: trigger.eventAt }) : null;
    const personWithToken = person as (typeof person & { attribution_token?: string | null });

    if (trigger.triggerType === "dm_keyword" && trigger.senderId && person && isOpenStudyReply(trigger.text)) {
      try {
        const delivered = await deliverPendingStudyCard({ config, personId: person.id, recipientId: trigger.senderId, inboundExternalEventId: trigger.externalEventId, eventAt: trigger.eventAt });
        if (delivered) {
          sent += 1;
          continue;
        }
      } catch (error) {
        await service.from("social_events").insert({
          external_event_id: trigger.externalEventId,
          trigger_type: "dm_keyword",
          matched_keyword: "OPEN",
          person_id: person.id,
          delivery_status: "failed",
          error_code: (error instanceof Error ? error.message : "Study card delivery failed").slice(0, 500),
          event_at: trigger.eventAt
        });
        continue;
      }
    }

    const match = findMatchingAutomation(trigger.text, automations.filter((item) => item.trigger_type === trigger.triggerType));
    if (!match) {
      await service.from("social_events").insert({ external_event_id: trigger.externalEventId, trigger_type: trigger.triggerType, source_media_id: trigger.mediaId, person_id: person?.id ?? null, delivery_status: "ignored", event_at: trigger.eventAt });
      continue;
    }

    const destinationUrl = attributedDestination(match.automation.destination_url, personWithToken?.attribution_token ?? null);
    try {
      const recipient = { id: trigger.senderId };
      if (!trigger.senderId) throw new Error("Instagram webhook did not include a usable recipient.");
      const reply = buildSocialReply(match.automation.reply_text, destinationUrl);
      const result = await graphFetch(`${encodeURIComponent(config.instagramUserId)}/messages`, config.accessToken, config.graphVersion, { method: "POST", body: JSON.stringify({ recipient, message: { text: reply } }) });
      const providerMessageId = typeof result.message_id === "string" ? result.message_id : null;

      await service.from("social_events").insert({ external_event_id: trigger.externalEventId, automation_id: match.automation.id, trigger_type: trigger.triggerType, matched_keyword: match.keyword, source_media_id: trigger.mediaId, person_id: person?.id ?? null, destination_url: destinationUrl, delivery_status: "sent", provider_message_id: providerMessageId, event_at: trigger.eventAt });

      if (person) {
        await Promise.all([
          recordPersonEvent({ personId: person.id, eventType: "automation_reply_sent", channel: "instagram", eventName: "Instagram automation reply sent", automationId: match.automation.id, externalEventId: `crm:reply:${trigger.externalEventId}`, metadata: { matched_keyword: match.keyword, destination_url: destinationUrl, source_media_id: trigger.mediaId, signature_flow: null }, occurredAt: trigger.eventAt }),
          recordInboxOutbound({ personId: person.id, body: reply, providerMessageId, externalEventId: `automation:${trigger.externalEventId}`, kind: "automation", at: trigger.eventAt, metadata: { automation_id: match.automation.id, matched_keyword: match.keyword, signature_flow: null } })
        ]);
      }
      sent += 1;
    } catch (error) {
      await service.from("social_events").insert({ external_event_id: trigger.externalEventId, automation_id: match.automation.id, trigger_type: trigger.triggerType, matched_keyword: match.keyword, source_media_id: trigger.mediaId, person_id: person?.id ?? null, destination_url: destinationUrl, delivery_status: "failed", error_code: (error instanceof Error ? error.message : "Instagram send failed").slice(0, 500), event_at: trigger.eventAt });
    }
  }
  return { processed: triggers.length, sent, queued };
}

export async function retryInstagramAutomationEvent(eventId: number) {
  const config = await getInstagramConfig();
  const service = createServiceClient();
  if (!config || !service) throw new Error("Instagram is not configured.");

  const { data: event, error: eventError } = await service.from("social_events")
    .select("id,external_event_id,automation_id,trigger_type,matched_keyword,source_media_id,person_id,destination_url,delivery_status")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message);
  if (!event) throw new Error("Automation event not found.");
  if (event.delivery_status !== "failed") throw new Error("Only failed automation events can be retried.");
  if (!event.automation_id) throw new Error("The failed event no longer has an automation to retry.");

  const baseExternalEventId = String(event.external_event_id).split(":retry:")[0];
  const { data: successfulRetry } = await service.from("social_events")
    .select("id,provider_message_id")
    .like("external_event_id", `${baseExternalEventId}:retry:%`)
    .eq("delivery_status", "sent")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (successfulRetry) {
    return { id: successfulRetry.id, status: "already_sent" as const, providerMessageId: successfulRetry.provider_message_id ?? null };
  }

  const { data: originalEvent } = await service.from("social_events")
    .select("id,external_event_id,automation_id,trigger_type,matched_keyword,source_media_id,person_id,destination_url,delivery_status")
    .eq("external_event_id", baseExternalEventId)
    .maybeSingle();
  const sourceEvent = originalEvent ?? event;

  const { data: automation, error: automationError } = await service.from("social_automations")
    .select("id,name,reply_text,destination_url")
    .eq("id", sourceEvent.automation_id)
    .maybeSingle();
  if (automationError) throw new Error(automationError.message);
  if (!automation) throw new Error("The automation used by this event no longer exists.");

  let personId = typeof sourceEvent.person_id === "string" ? sourceEvent.person_id : null;
  let instagramRecipientId: string | null = null;

  if (sourceEvent.trigger_type === "dm_keyword") {
    if (!personId) {
      const messageId = String(baseExternalEventId).match(/^message:([^:]+)/)?.[1] ?? null;
      if (messageId) {
        const { data: inbound } = await service.from("inbox_messages")
          .select("person_id")
          .eq("platform", "instagram")
          .eq("direction", "inbound")
          .eq("provider_message_id", messageId)
          .maybeSingle();
        if (typeof inbound?.person_id === "string") personId = inbound.person_id;
      }
    }
    if (personId) {
      const { data: person } = await service.from("people").select("instagram_user_id").eq("id", personId).maybeSingle();
      if (typeof person?.instagram_user_id === "string") instagramRecipientId = person.instagram_user_id;
    }
  }

  const commentId = sourceEvent.trigger_type === "comment_keyword"
    ? String(baseExternalEventId).match(/^comment:([^:]+)/)?.[1] ?? null
    : null;
  const destinationUrl = typeof sourceEvent.destination_url === "string" && sourceEvent.destination_url.trim()
    ? sourceEvent.destination_url
    : automation.destination_url;
  const title = studyTitleFromDestination(destinationUrl, automation.name.replace(/[!]+$/g, ""));
  const reply = sourceEvent.trigger_type === "comment_keyword" && destinationUrl
    ? buildStudyHandshake(title)
    : buildSocialReply(automation.reply_text, destinationUrl);
  const now = new Date().toISOString();
  const retryExternalEventId = `${baseExternalEventId}:retry:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  try {
    const recipient = sourceEvent.trigger_type === "comment_keyword"
      ? { comment_id: commentId }
      : { id: instagramRecipientId };
    if ((sourceEvent.trigger_type === "comment_keyword" && !commentId) || (sourceEvent.trigger_type === "dm_keyword" && !instagramRecipientId)) {
      throw new Error("The original Instagram recipient could not be recovered for this retry.");
    }

    const result = await graphFetch(`${encodeURIComponent(config.instagramUserId)}/messages`, config.accessToken, config.graphVersion, {
      method: "POST",
      body: JSON.stringify({ recipient, message: { text: reply } })
    });
    const providerMessageId = typeof result.message_id === "string" ? result.message_id : null;
    const { data: retryEvent, error: retryEventError } = await service.from("social_events").insert({
      external_event_id: retryExternalEventId,
      automation_id: sourceEvent.automation_id,
      trigger_type: sourceEvent.trigger_type,
      matched_keyword: sourceEvent.matched_keyword,
      source_media_id: sourceEvent.source_media_id,
      person_id: personId,
      destination_url: destinationUrl,
      delivery_status: "sent",
      provider_message_id: providerMessageId,
      event_at: now
    }).select("id").single();
    if (retryEventError) throw new Error(retryEventError.message);

    if (personId) {
      await Promise.all([
        recordPersonEvent({ personId, eventType: "automation_reply_sent", channel: "instagram", eventName: sourceEvent.trigger_type === "comment_keyword" && destinationUrl ? "Instagram study handshake retry sent" : "Instagram automation retry sent", automationId: sourceEvent.automation_id, externalEventId: `crm:retry:${retryExternalEventId}`, metadata: { retry_of_event_id: sourceEvent.id, matched_keyword: sourceEvent.matched_keyword, destination_url: destinationUrl, source_media_id: sourceEvent.source_media_id, signature_flow: sourceEvent.trigger_type === "comment_keyword" && destinationUrl ? "you-found-the-study" : null }, occurredAt: now }),
        recordInboxOutbound({ personId, body: reply, providerMessageId, externalEventId: `automation-retry:${retryExternalEventId}`, kind: "automation", at: now, metadata: { automation_id: sourceEvent.automation_id, matched_keyword: sourceEvent.matched_keyword, retry_of_event_id: sourceEvent.id, signature_flow: sourceEvent.trigger_type === "comment_keyword" && destinationUrl ? "you-found-the-study" : null } })
      ]);
    }

    return { id: retryEvent.id, status: "sent" as const, providerMessageId };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Instagram retry failed").slice(0, 500);
    await service.from("social_events").insert({
      external_event_id: retryExternalEventId,
      automation_id: sourceEvent.automation_id,
      trigger_type: sourceEvent.trigger_type,
      matched_keyword: sourceEvent.matched_keyword,
      source_media_id: sourceEvent.source_media_id,
      person_id: personId,
      destination_url: destinationUrl,
      delivery_status: "failed",
      error_code: `Retry of event ${sourceEvent.id}: ${message}`.slice(0, 500),
      event_at: now
    });
    throw new Error(message);
  }
}

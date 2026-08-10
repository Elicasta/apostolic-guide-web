import { buildSocialReply, findMatchingAutomation, getInstagramConfig, listSocialAutomations, parseInstagramWebhook } from "./social-messaging";
import { createServiceClient } from "./supabase";
import { recordPersonEvent, upsertInstagramPerson } from "./people-crm";

function attributedDestination(destinationUrl: string | null | undefined, token: string | null | undefined) {
  const raw = destinationUrl?.trim();
  if (!raw) return null;
  if (!token) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === "apostolicguide.com" || host.endsWith(".apostolicguide.com")) {
      url.searchParams.set("agp", token);
      if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "instagram");
      if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "social_automation");
      return url.toString();
    }
  } catch {}
  return raw;
}

async function graphFetch(path: string, accessToken: string, graphVersion: string, init?: RequestInit) {
  const response = await fetch(`https://graph.instagram.com/${graphVersion}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof json.error === "object" && json.error && "message" in json.error
      ? String((json.error as { message?: unknown }).message ?? `Meta request failed (${response.status}).`)
      : `Meta request failed (${response.status}).`;
    throw new Error(message);
  }
  return json;
}

export async function processInstagramWebhookAttributed(payload: unknown) {
  const config = await getInstagramConfig();
  const service = createServiceClient();
  if (!config || !service) return { processed: 0, sent: 0 };

  const triggers = parseInstagramWebhook(payload);
  if (!triggers.length) return { processed: 0, sent: 0 };

  await service.from("social_connection_status").upsert({
    platform: "instagram",
    last_webhook_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: "platform" });

  const automations = await listSocialAutomations();
  let sent = 0;

  for (const trigger of triggers) {
    const existing = await service.from("social_events").select("id").eq("external_event_id", trigger.externalEventId).maybeSingle();
    if (existing.data) continue;

    const match = findMatchingAutomation(trigger.text, automations.filter((item) => item.trigger_type === trigger.triggerType));
    const person = trigger.senderId
      ? await upsertInstagramPerson({ instagramUserId: trigger.senderId, sourceDetail: trigger.triggerType === "comment_keyword" ? "instagram_comment" : "instagram_dm", seenAt: trigger.eventAt })
      : null;

    if (!match) {
      await service.from("social_events").insert({
        external_event_id: trigger.externalEventId,
        trigger_type: trigger.triggerType,
        source_media_id: trigger.mediaId,
        person_id: person?.id ?? null,
        delivery_status: "ignored",
        event_at: trigger.eventAt
      });
      continue;
    }

    const destinationUrl = attributedDestination(match.automation.destination_url, person?.attribution_token ?? null);

    try {
      const recipient = trigger.triggerType === "comment_keyword" ? { comment_id: trigger.commentId } : { id: trigger.senderId };
      if ((trigger.triggerType === "comment_keyword" && !trigger.commentId) || (trigger.triggerType === "dm_keyword" && !trigger.senderId)) {
        throw new Error("Instagram webhook did not include a usable recipient.");
      }

      const reply = buildSocialReply(match.automation.reply_text, destinationUrl);
      const result = await graphFetch(`${encodeURIComponent(config.instagramUserId)}/messages`, config.accessToken, config.graphVersion, {
        method: "POST",
        body: JSON.stringify({ recipient, message: { text: reply } })
      });

      await service.from("social_events").insert({
        external_event_id: trigger.externalEventId,
        automation_id: match.automation.id,
        trigger_type: trigger.triggerType,
        matched_keyword: match.keyword,
        source_media_id: trigger.mediaId,
        person_id: person?.id ?? null,
        destination_url: destinationUrl,
        delivery_status: "sent",
        provider_message_id: typeof result.message_id === "string" ? result.message_id : null,
        event_at: trigger.eventAt
      });

      if (person) {
        await recordPersonEvent({
          personId: person.id,
          eventType: "automation_reply_sent",
          channel: "instagram",
          eventName: "Instagram automation reply sent",
          automationId: match.automation.id,
          externalEventId: `crm:reply:${trigger.externalEventId}`,
          metadata: {
            matched_keyword: match.keyword,
            destination_url: destinationUrl,
            source_media_id: trigger.mediaId
          },
          occurredAt: trigger.eventAt
        });
      }

      sent += 1;
    } catch (error) {
      await service.from("social_events").insert({
        external_event_id: trigger.externalEventId,
        automation_id: match.automation.id,
        trigger_type: trigger.triggerType,
        matched_keyword: match.keyword,
        source_media_id: trigger.mediaId,
        person_id: person?.id ?? null,
        destination_url: destinationUrl,
        delivery_status: "failed",
        error_code: (error instanceof Error ? error.message : "Instagram send failed").slice(0, 500),
        event_at: trigger.eventAt
      });
    }
  }

  return { processed: triggers.length, sent };
}

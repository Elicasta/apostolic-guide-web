import { randomUUID } from "node:crypto";
import { buildBroadcastEmail, type BroadcastCampaign } from "./broadcast-email";
import { addCampaignTracking, type CampaignIntelligenceRow, type CampaignLinkRow } from "./campaign-intelligence";
import { createServiceClient } from "./supabase";

export const RESEND_SEGMENTS = {
  general: process.env.RESEND_GENERAL_SEGMENT_ID ?? "9120e755-2e0a-4315-a663-fb169040fc0f",
  content: process.env.RESEND_CONTENT_SEGMENT_ID ?? "ad9799e3-9f96-48e3-a06e-9e1a401dde83",
  media: process.env.RESEND_MEDIA_SEGMENT_ID ?? "0a35e6d1-8163-4ee2-b559-7b3b6b218e2d"
} as const;

export type AudienceKey = keyof typeof RESEND_SEGMENTS;

function headers() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function sender() {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("RESEND_FROM_EMAIL is not configured.");
  return from.includes("<") ? from : `Apostolic Guide <${from}>`;
}

async function updateCampaignByBroadcast(broadcastId: string, values: Record<string, unknown>) {
  const service = createServiceClient();
  if (!service) return;
  const { error } = await service.schema("analytics").from("email_campaigns")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("resend_broadcast_id", broadcastId);
  if (error) console.error("campaign intelligence update failed", { code: error.code, message: error.message });
}

export async function createBroadcastDraft(input: { campaign: BroadcastCampaign; audience: AudienceKey; createdBy?: string }) {
  const campaignId = randomUUID();
  const trackedUrl = addCampaignTracking(input.campaign.url, campaignId, input.campaign.type);
  const trackedCampaign = { ...input.campaign, url: trackedUrl };
  const email = buildBroadcastEmail(trackedCampaign);
  const campaignName = `${input.campaign.eyebrow}: ${input.campaign.title}`.slice(0, 180);
  const service = createServiceClient();

  if (service) {
    const { error } = await service.schema("analytics").from("email_campaigns").insert({
      id: campaignId,
      campaign_type: input.campaign.type,
      audience: input.audience,
      name: campaignName,
      subject: input.campaign.subject,
      title: input.campaign.title,
      destination_url: input.campaign.url,
      tracked_url: trackedUrl,
      status: "creating",
      created_by: input.createdBy ?? null
    });
    if (error) console.error("campaign ledger insert failed", { code: error.code, message: error.message });
  }

  try {
    const response = await fetch("https://api.resend.com/broadcasts", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        segment_id: RESEND_SEGMENTS[input.audience],
        from: sender(),
        name: campaignName,
        subject: input.campaign.subject,
        preview_text: input.campaign.previewText,
        html: email.html,
        text: email.text
      })
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json() as { id: string };
    if (service) {
      const { error } = await service.schema("analytics").from("email_campaigns")
        .update({ resend_broadcast_id: result.id, status: "draft", updated_at: new Date().toISOString() })
        .eq("id", campaignId);
      if (error) console.error("campaign ledger link failed", { code: error.code, message: error.message });
    }
    return { ...result, campaignId };
  } catch (error) {
    if (service) await service.schema("analytics").from("email_campaigns").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", campaignId);
    throw error;
  }
}

export async function sendBroadcastDraft(id: string) {
  const response = await fetch(`https://api.resend.com/broadcasts/${encodeURIComponent(id)}/send`, {
    method: "POST",
    headers: headers(),
    body: "{}"
  });
  if (!response.ok) throw new Error(await response.text());
  const result = await response.json() as { id: string };
  await updateCampaignByBroadcast(id, { status: "sending" });
  return result;
}

export async function listBroadcasts() {
  if (!process.env.RESEND_API_KEY) return [];
  try {
    const response = await fetch("https://api.resend.com/broadcasts", { headers: headers(), cache: "no-store" });
    if (!response.ok) return [];
    const result = await response.json() as { data?: Array<{ id: string; name?: string; status: string; created_at: string; sent_at?: string | null; scheduled_at?: string | null; segment_id?: string }> };
    return result.data ?? [];
  } catch {
    return [];
  }
}

export async function listCampaignIntelligence(limit = 12) {
  const service = createServiceClient();
  if (!service) return [] as CampaignIntelligenceRow[];
  const { data, error } = await service.schema("analytics").from("email_campaign_intelligence")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("campaign intelligence query failed", { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as CampaignIntelligenceRow[];
}

export async function listCampaignLinks(campaignIds: string[]) {
  const service = createServiceClient();
  if (!service || !campaignIds.length) return [] as CampaignLinkRow[];
  const { data, error } = await service.schema("analytics").from("email_campaign_link_rollups")
    .select("campaign_id,clicked_url,click_events,unique_clickers")
    .in("campaign_id", campaignIds)
    .order("unique_clickers", { ascending: false });
  if (error) {
    console.error("campaign links query failed", { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as CampaignLinkRow[];
}

export async function sendBroadcastTest(input: { campaign: BroadcastCampaign; to: string }) {
  const email = buildBroadcastEmail(input.campaign);
  const html = email.html.replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", "https://apostolicguide.com");
  const text = email.text.replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", "https://apostolicguide.com");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      from: sender(),
      to: [input.to],
      subject: `[TEST] ${input.campaign.subject}`,
      html,
      text,
      tags: [{ name: "category", value: "broadcast_test" }]
    })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ id?: string }>;
}

export async function syncContactSegments(email: string, preferences: { content: boolean; media: boolean }) {
  if (!process.env.RESEND_API_KEY) return;
  const syncOne = async (segmentId: string, shouldBelong: boolean) => {
    const url = `https://api.resend.com/contacts/${encodeURIComponent(email)}/segments/${segmentId}`;
    const response = await fetch(url, { method: shouldBelong ? "POST" : "DELETE", headers: headers() });
    if (!response.ok && response.status !== 404) throw new Error(await response.text());
  };
  await syncOne(RESEND_SEGMENTS.general, true);
  await syncOne(RESEND_SEGMENTS.content, preferences.content);
  await syncOne(RESEND_SEGMENTS.media, preferences.media);
}

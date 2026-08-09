import { buildBroadcastEmail, type BroadcastCampaign } from "./broadcast-email";

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

export async function createBroadcastDraft(input: { campaign: BroadcastCampaign; audience: AudienceKey }) {
  const email = buildBroadcastEmail(input.campaign);
  const response = await fetch("https://api.resend.com/broadcasts", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      segment_id: RESEND_SEGMENTS[input.audience],
      from: sender(),
      name: `${input.campaign.eyebrow}: ${input.campaign.title}`.slice(0, 180),
      subject: input.campaign.subject,
      preview_text: input.campaign.previewText,
      html: email.html,
      text: email.text
    })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ id: string }>;
}

export async function sendBroadcastDraft(id: string) {
  const response = await fetch(`https://api.resend.com/broadcasts/${encodeURIComponent(id)}/send`, {
    method: "POST",
    headers: headers(),
    body: "{}"
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ id: string }>;
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

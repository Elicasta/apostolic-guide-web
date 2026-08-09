import { createHmac, timingSafeEqual } from "node:crypto";

const TRACKED_HOSTS = new Set(["apostolicguide.com", "www.apostolicguide.com", "app.apostolicguide.com"]);
const WEBHOOK_TOLERANCE_SECONDS = 300;

export function addCampaignTracking(destination: string, campaignId: string, contentType: string) {
  const url = new URL(destination);
  if (!TRACKED_HOSTS.has(url.hostname.toLowerCase())) return url.toString();
  url.searchParams.set("utm_source", "apostolic_guide");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", campaignId);
  url.searchParams.set("utm_content", contentType);
  return url.toString();
}

type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export function verifyResendWebhook(payload: string, headers: SvixHeaders, secret: string, nowMs = Date.now()) {
  if (!headers.id || !headers.timestamp || !headers.signature || !secret) return false;
  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try { key = Buffer.from(rawSecret, "base64"); }
  catch { return false; }
  if (!key.length) return false;

  const signed = `${headers.id}.${headers.timestamp}.${payload}`;
  const expected = createHmac("sha256", key).update(signed).digest();
  const candidates = headers.signature
    .split(/\s+/)
    .map((part) => part.split(","))
    .filter(([version, value]) => version === "v1" && Boolean(value))
    .map(([, value]) => value);

  return candidates.some((candidate) => {
    try {
      const received = Buffer.from(candidate, "base64");
      return received.length === expected.length && timingSafeEqual(received, expected);
    } catch {
      return false;
    }
  });
}

export type CampaignIntelligenceRow = {
  id: string;
  resend_broadcast_id: string | null;
  campaign_type: string;
  audience: string;
  name: string;
  subject: string;
  title: string;
  destination_url: string;
  tracked_url: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  updated_at: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  click_events: number;
  bounced: number;
  complained: number;
  failed: number;
  suppressed: number;
  delayed: number;
  site_sessions: number;
  site_visitors: number;
  site_page_views: number;
  article_completions: number;
  app_transitions: number;
};

export type CampaignLinkRow = {
  campaign_id: string;
  clicked_url: string;
  click_events: number;
  unique_clickers: number;
};

export function rate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

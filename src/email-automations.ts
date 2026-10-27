import { createServiceClient } from "./supabase";
import { buildWelcomeEmail } from "./welcome-email";
import { DEFAULT_WELCOME_COPY, parseWelcomeCopy, type WelcomeCopy, type EmailAutomationStatus } from "./welcome-automation-config";

export const WELCOME_KEY = "welcome";
const MAX_ATTEMPTS = 3;

export type WelcomeAutomation = {
  available: boolean;
  status: EmailAutomationStatus;
  copy: WelcomeCopy;
  revision: number;
  updatedAt: string | null;
};

export async function getWelcomeAutomation(): Promise<WelcomeAutomation> {
  const service = createServiceClient();
  if (!service) return { available: false, status: "paused", copy: DEFAULT_WELCOME_COPY, revision: 0, updatedAt: null };
  const { data, error } = await service.from("email_automations").select("status,copy,revision,updated_at").eq("key", WELCOME_KEY).maybeSingle();
  if (error || !data || !["active","paused"].includes(data.status)) {
    if (error) console.error("Welcome automation config unavailable", { code: error.code });
    return { available: false, status: "paused", copy: DEFAULT_WELCOME_COPY, revision: 0, updatedAt: null };
  }
  return { available: true, status: data.status as EmailAutomationStatus, copy: parseWelcomeCopy(data.copy), revision: Number(data.revision), updatedAt: data.updated_at };
}

type Delivery = {
  id: string;
  subscriber_id: string;
  status: string;
  attempts: number;
  next_attempt_at: string;
};

/** Insert at most once per subscriber, including across concurrent signup requests. */
export async function enqueueWelcomeEmail(subscriberId: string) {
  const settings = await getWelcomeAutomation();
  if (!settings.available || settings.status !== "active") return "inactive";
  const service = createServiceClient();
  if (!service) return "unavailable";
  const { data, error } = await service.from("email_automation_deliveries")
    .upsert({ automation_key: WELCOME_KEY, subscriber_id: subscriberId }, { onConflict: "automation_key,subscriber_id", ignoreDuplicates: true })
    .select("id").maybeSingle();
  if (error) {
    console.error("Welcome delivery queue failed", { code: error.code });
    return "unavailable";
  }
  if (!data?.id) return "duplicate";
  return processWelcomeDelivery(String(data.id));
}

async function updateDelivery(id: string, values: Record<string, unknown>) {
  const service = createServiceClient();
  if (!service) return false;
  const { error } = await service.from("email_automation_deliveries")
    .update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("Welcome delivery ledger update failed", { code: error.code });
  return !error;
}

export async function processWelcomeDelivery(id: string) {
  const service = createServiceClient();
  if (!service) return "unavailable";
  const settings = await getWelcomeAutomation();
  if (!settings.available || settings.status !== "active") return "inactive";
  const { data: original, error: readError } = await service.from("email_automation_deliveries")
    .select("id,subscriber_id,status,attempts,next_attempt_at").eq("id", id).eq("automation_key", WELCOME_KEY).maybeSingle();
  if (readError || !original) return "unavailable";
  const row = original as Delivery;
  if (!["queued","failed"].includes(row.status) || row.attempts >= MAX_ATTEMPTS || Date.parse(row.next_attempt_at) > Date.now()) return "not_due";

  // Compare-and-swap claim: concurrent workers cannot acquire the same delivery.
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await service.from("email_automation_deliveries")
    .update({ status: "processing", attempts: row.attempts + 1, started_at: now, updated_at: now })
    .eq("id", id).eq("status", row.status).eq("attempts", row.attempts)
    .lte("next_attempt_at", now).select("id").maybeSingle();
  if (claimError || !claimed) return "already_claimed";

  const subscriberResult = await service.from("email_subscribers")
    .select("id,email,status,wants_live_teachings,wants_new_articles,unsubscribe_token,welcome_sent_at")
    .eq("id", row.subscriber_id).maybeSingle();
  const subscriber = subscriberResult.data;
  if (subscriberResult.error || !subscriber) {
    await updateDelivery(id, { status: "uncertain", last_error: "Could not verify subscriber", completed_at: now });
    return "uncertain";
  }
  if (subscriber.status !== "subscribed" || subscriber.welcome_sent_at) {
    await updateDelivery(id, { status: "skipped", last_error: "Not eligible for welcome", completed_at: now });
    return "skipped";
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    await updateDelivery(id, { status: "failed", attempts: MAX_ATTEMPTS, last_error: "Resend configuration missing", completed_at: now });
    return "failed";
  }

  const unsubscribeUrl = "https://www.apostolicguide.com/unsubscribe?token=" + encodeURIComponent(subscriber.unsubscribe_token);
  const email = buildWelcomeEmail({ liveTeachings: subscriber.wants_live_teachings, newArticles: subscriber.wants_new_articles, copy: settings.copy, unsubscribeUrl });
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json", "Idempotency-Key": "ag-welcome-" + subscriber.id },
      body: JSON.stringify({ from, to: [subscriber.email], subject: email.subject, html: email.html, text: email.text,
        tags: [{ name: "category", value: "subscriber_welcome" }] })
    });
  } catch {
    // A network timeout can mean Resend accepted the request. Never blind-retry.
    await updateDelivery(id, { status: "uncertain", last_error: "Resend response unknown; inspect before retrying", completed_at: new Date().toISOString() });
    return "uncertain";
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const attempts = row.attempts + 1;
    await updateDelivery(id, { status: "failed", last_error: "Resend HTTP " + response.status,
      next_attempt_at: new Date(Date.now() + Math.min(60, 5 * attempts) * 60_000).toISOString(),
      attempts: retryable ? attempts : MAX_ATTEMPTS, completed_at: new Date().toISOString() });
    return "failed";
  }

  let providerId: string | null = null;
  try { const json = await response.json() as { id?: string }; providerId = json.id ?? null; } catch { /* accepted but no readable response body */ }
  const finished = new Date().toISOString();
  const saved = await updateDelivery(id, { status: "sent", resend_email_id: providerId, last_error: null, completed_at: finished });
  if (!saved) return "uncertain";
  const result = await service.from("email_subscribers").update({ welcome_email_id: providerId, welcome_sent_at: finished, updated_at: finished }).eq("id", subscriber.id).eq("status", "subscribed");
  if (result.error) console.error("Welcome subscriber projection failed", { code: result.error.code });
  return "sent";
}

export async function runDueWelcomeDeliveries(limit = 20) {
  const settings = await getWelcomeAutomation();
  if (!settings.available || settings.status !== "active") return { processed: 0, results: [] as string[] };
  const service = createServiceClient();
  if (!service) return { processed: 0, results: [] as string[] };
  const now = new Date().toISOString();
  // An unknown provider outcome must be reviewed manually, not resent.
  await service.from("email_automation_deliveries")
    .update({ status: "uncertain", last_error: "Stale processing lease; verify in Resend", updated_at: now })
    .eq("automation_key", WELCOME_KEY).eq("status", "processing")
    .lt("started_at", new Date(Date.now() - 15 * 60_000).toISOString());
  const { data, error } = await service.from("email_automation_deliveries").select("id")
    .eq("automation_key", WELCOME_KEY).in("status", ["queued","failed"])
    .lt("attempts", MAX_ATTEMPTS).lte("next_attempt_at", now)
    .order("created_at", { ascending: true }).limit(Math.min(limit, 20));
  if (error) throw new Error("Delivery queue unavailable");
  const results: string[] = [];
  for (const item of data ?? []) results.push(await processWelcomeDelivery(item.id));
  return { processed: results.length, results };
}

export type WelcomeDeliveryActivity = {
  id: string;
  status: string;
  attempts: number;
  created_at: string;
  completed_at: string | null;
  last_error: string | null;
  email_subscribers: { email: string } | null;
};

export async function listWelcomeDeliveries() {
  const service = createServiceClient();
  if (!service) return [] as WelcomeDeliveryActivity[];
  const { data, error } = await service.from("email_automation_deliveries")
    .select("id,status,attempts,created_at,completed_at,last_error,email_subscribers(email)")
    .eq("automation_key", WELCOME_KEY).order("created_at", { ascending: false }).limit(40);
  if (error) return [];
  return (data ?? []) as unknown as WelcomeDeliveryActivity[];
}

export async function sendWelcomeTest(to: string, copy: WelcomeCopy) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Resend is not configured.");
  const email = buildWelcomeEmail({ liveTeachings: true, newArticles: true, copy });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: "[TEST] " + email.subject, html: email.html, text: email.text,
      tags: [{ name: "category", value: "welcome_automation_test" }] })
  });
  if (!response.ok) throw new Error("Resend rejected test with HTTP " + response.status + ".");
  const result = await response.json() as { id?: string };
  return result.id ?? null;
}

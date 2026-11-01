import {
  COMMENT_GUIDE_MODEL,
  COMMENT_GUIDE_PROMPT_VERSION,
  findExplicitCommentAutomation,
  type CommentGuideAction,
  type CommentGuideContentionLevel,
  type CommentGuideIntent,
  type CommentGuideMode,
  type PreparedCommentGuideDecision
} from "./comment-guide";
import { prepareInstagramCommentDecision } from "./comment-guide-ai";
import { recordInboxOutbound } from "./inbox";
import { recordPersonEvent } from "./people-crm";
import { attributedDestination } from "./social-attribution-url";
import { getInstagramConfig, listSocialAutomations, type ParsedInstagramTrigger } from "./social-messaging";
import { createServiceClient } from "./supabase";

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

export type CommentGuideSettings = {
  mode: CommentGuideMode;
  model: typeof COMMENT_GUIDE_MODEL;
  positiveRepliesEnabled: boolean;
  publicKeywordAckEnabled: boolean;
  dailyReplyLimit: number;
  updatedAt: string | null;
};

export type CommentGuideJob = {
  id: number;
  external_event_id: string;
  platform: "instagram";
  comment_id: string;
  parent_comment_id: string | null;
  media_id: string | null;
  sender_id: string | null;
  person_id: string | null;
  inbound_text: string;
  event_at: string;
  status: string;
  intent: CommentGuideIntent | null;
  action: CommentGuideAction | null;
  contention_level: CommentGuideContentionLevel | null;
  confidence: number | null;
  automation_id: string | null;
  matched_keyword: string | null;
  pathway_slug: string | null;
  public_reply_text: string | null;
  private_reply_text: string | null;
  destination_url: string | null;
  scripture_references: string[];
  decision_json: Record<string, unknown> | null;
  doctrine_review_json: Record<string, unknown> | null;
  model: string | null;
  prompt_version: string | null;
  available_at: string;
  classification_attempts: number;
  delivery_attempts: number;
  locked_at: string | null;
  public_reply_provider_id: string | null;
  private_reply_provider_id: string | null;
  last_error: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommentGuideDashboard = {
  dbReady: boolean;
  error: string | null;
  settings: CommentGuideSettings;
  metrics: { receivedToday: number; repliedToday: number; shadowedToday: number; failed: number };
  recentJobs: CommentGuideJob[];
};

const DEFAULT_SETTINGS: CommentGuideSettings = {
  mode: "shadow",
  model: COMMENT_GUIDE_MODEL,
  positiveRepliesEnabled: true,
  publicKeywordAckEnabled: true,
  dailyReplyLimit: 250,
  updatedAt: null
};

const JOB_SELECT = [
  "id", "external_event_id", "platform", "comment_id", "parent_comment_id", "media_id", "sender_id", "person_id",
  "inbound_text", "event_at", "status", "intent", "action", "contention_level", "confidence", "automation_id",
  "matched_keyword", "pathway_slug", "public_reply_text", "private_reply_text", "destination_url", "scripture_references",
  "decision_json", "doctrine_review_json", "model", "prompt_version", "available_at", "classification_attempts",
  "delivery_attempts", "locked_at", "public_reply_provider_id", "private_reply_provider_id", "last_error", "completed_at",
  "created_at", "updated_at"
].join(",");

function settingsFromRow(row: Record<string, unknown> | null | undefined): CommentGuideSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    mode: row.mode === "paused" || row.mode === "live" ? row.mode : "shadow",
    model: COMMENT_GUIDE_MODEL,
    positiveRepliesEnabled: row.positive_replies_enabled !== false,
    publicKeywordAckEnabled: row.public_keyword_ack_enabled !== false,
    dailyReplyLimit: Math.min(Math.max(Number(row.daily_reply_limit) || 250, 1), 5000),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null
  };
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Unknown Comment Guide error")).slice(0, 1000);
}

function retryAt(attempt: number, seed: number) {
  const baseSeconds = Math.min(60 * 2 ** Math.max(attempt - 1, 0), 30 * 60);
  const jitterSeconds = (seed * 17 + attempt * 11) % 45;
  return new Date(Date.now() + (baseSeconds + jitterSeconds) * 1000).toISOString();
}

function startOfUtcDay() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

async function loadSettings(service: ServiceClient) {
  const result = await service.from("social_comment_guide_settings").select("*").eq("id", 1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return settingsFromRow(result.data as Record<string, unknown> | null);
}

async function updateSocialEvent(service: ServiceClient, job: CommentGuideJob, values: Record<string, unknown>) {
  const { error } = await service.from("social_events").update(values).eq("external_event_id", job.external_event_id);
  if (error) console.error("Comment Guide could not update the social event ledger", error);
}

export async function enqueueInstagramCommentGuide(input: {
  trigger: ParsedInstagramTrigger;
  personId?: string | null;
}) {
  if (input.trigger.triggerType !== "comment_keyword" || !input.trigger.commentId) return { queued: false, status: "ignored" as const };
  if (input.trigger.selfAuthored) return { queued: false, status: "ignored" as const };
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const settings = await loadSettings(service);
  const paused = settings.mode === "paused";
  const now = new Date().toISOString();
  const row = {
    external_event_id: input.trigger.externalEventId,
    platform: "instagram",
    comment_id: input.trigger.commentId,
    parent_comment_id: input.trigger.parentCommentId,
    media_id: input.trigger.mediaId,
    sender_id: input.trigger.senderId,
    person_id: input.personId ?? null,
    inbound_text: input.trigger.text.slice(0, 5000),
    event_at: input.trigger.eventAt,
    status: paused ? "ignored" : "received",
    available_at: now,
    last_error: paused ? "Comment Guide was paused when the comment arrived." : null,
    completed_at: paused ? now : null,
    updated_at: now
  };
  const result = await service.from("social_comment_guide_jobs")
    .upsert(row, { onConflict: "external_event_id", ignoreDuplicates: true })
    .select("id,status")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return { queued: false, status: "duplicate" as const };

  const eventResult = await service.from("social_events").upsert({
    external_event_id: input.trigger.externalEventId,
    trigger_type: "comment_keyword",
    source_media_id: input.trigger.mediaId,
    person_id: input.personId ?? null,
    delivery_status: paused ? "ignored" : "received",
    error_code: paused ? "Comment Guide paused" : null,
    event_at: input.trigger.eventAt
  }, { onConflict: "external_event_id", ignoreDuplicates: true });
  if (eventResult.error) throw new Error(eventResult.error.message);
  return { queued: !paused, status: paused ? "ignored" as const : "received" as const };
}

async function recoverStaleClaims(service: ServiceClient) {
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  await Promise.all([
    service.from("social_comment_guide_jobs").update({ status: "classification_retry", available_at: now, locked_at: null, updated_at: now }).eq("status", "classifying").lt("locked_at", stale),
    service.from("social_comment_guide_jobs").update({ status: "delivery_retry", available_at: now, locked_at: null, updated_at: now }).eq("status", "sending").lt("locked_at", stale)
  ]);
}

async function claimJob(service: ServiceClient, statuses: string[], claimedStatus: "classifying" | "sending") {
  const due = await service.from("social_comment_guide_jobs")
    .select(JOB_SELECT)
    .in("status", statuses)
    .lte("available_at", new Date().toISOString())
    .order("available_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(8);
  if (due.error) throw new Error(due.error.message);
  for (const candidate of due.data ?? []) {
    const row = candidate as unknown as CommentGuideJob;
    const now = new Date().toISOString();
    const attempts = claimedStatus === "classifying"
      ? { classification_attempts: Number(row.classification_attempts ?? 0) + 1 }
      : { delivery_attempts: Number(row.delivery_attempts ?? 0) + 1 };
    const claimed = await service.from("social_comment_guide_jobs")
      .update({ status: claimedStatus, locked_at: now, updated_at: now, ...attempts })
      .eq("id", row.id)
      .in("status", statuses)
      .select(JOB_SELECT)
      .maybeSingle();
    if (claimed.error) throw new Error(claimed.error.message);
    if (claimed.data) return claimed.data as unknown as CommentGuideJob;
  }
  return null;
}

async function recentReplies(service: ServiceClient) {
  const result = await service.from("social_comment_guide_jobs")
    .select("public_reply_text")
    .in("status", ["sent", "shadowed"])
    .not("public_reply_text", "is", null)
    .order("updated_at", { ascending: false })
    .limit(20);
  return (result.data ?? []).map((row) => String(row.public_reply_text)).filter(Boolean);
}

async function personAttributionToken(service: ServiceClient, personId: string | null) {
  if (!personId) return null;
  const result = await service.from("people").select("attribution_token").eq("id", personId).maybeSingle();
  return typeof result.data?.attribution_token === "string" ? result.data.attribution_token : null;
}

async function alreadyAnsweredContention(service: ServiceClient, job: CommentGuideJob, prepared: PreparedCommentGuideDecision) {
  if (!job.sender_id || !job.media_id || !["doctrinal_objection", "gotcha_contention"].includes(prepared.intent)) return false;
  const result = await service.from("social_comment_guide_jobs")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", job.sender_id)
    .eq("media_id", job.media_id)
    .in("status", ["scheduled", "sending", "delivery_retry", "sent"])
    .in("intent", ["doctrinal_objection", "gotcha_contention"])
    .neq("id", job.id);
  if (result.error) throw new Error(result.error.message);
  return (result.count ?? 0) > 0;
}

async function jobIsSelfAuthored(service: ServiceClient, job: CommentGuideJob) {
  const [providerReply, providerEvent, connection, person] = await Promise.all([
    service.from("social_comment_guide_jobs")
      .select("id")
      .eq("public_reply_provider_id", job.comment_id)
      .neq("id", job.id)
      .limit(1)
      .maybeSingle(),
    service.from("social_events")
      .select("id")
      .eq("provider_message_id", job.comment_id)
      .eq("delivery_status", "sent")
      .limit(1)
      .maybeSingle(),
    service.from("social_connection_status")
      .select("instagram_user_id,username")
      .eq("platform", "instagram")
      .maybeSingle(),
    job.person_id
      ? service.from("people").select("instagram_user_id,instagram_username").eq("id", job.person_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  const queryError = providerReply.error || providerEvent.error || connection.error || person.error;
  if (queryError) throw new Error(queryError.message);
  if (providerReply.data || providerEvent.data) return true;
  const connectedId = typeof connection.data?.instagram_user_id === "string" ? connection.data.instagram_user_id : "";
  const senderId = job.sender_id?.trim() ?? "";
  const personId = typeof person.data?.instagram_user_id === "string" ? person.data.instagram_user_id.trim() : "";
  if (connectedId && (senderId === connectedId || personId === connectedId)) return true;
  const connectedUsername = typeof connection.data?.username === "string" ? connection.data.username.replace(/^@/, "").trim().toLocaleLowerCase() : "";
  const personUsername = typeof person.data?.instagram_username === "string" ? person.data.instagram_username.replace(/^@/, "").trim().toLocaleLowerCase() : "";
  return Boolean(connectedUsername && personUsername && connectedUsername === personUsername);
}

async function ignoreSelfAuthoredJob(service: ServiceClient, job: CommentGuideJob, expectedStatus: "classifying" | "sending") {
  const now = new Date().toISOString();
  const reason = "Ignored the connected Instagram account's own comment.";
  const update = await service.from("social_comment_guide_jobs").update({
    status: "ignored",
    action: "ignore",
    locked_at: null,
    completed_at: now,
    last_error: reason,
    updated_at: now
  }).eq("id", job.id).eq("status", expectedStatus);
  if (update.error) throw new Error(update.error.message);
  await updateSocialEvent(service, job, { delivery_status: "ignored", error_code: reason });
  return "ignored" as const;
}

async function classifyJob(service: ServiceClient, job: CommentGuideJob, settings: CommentGuideSettings) {
  try {
    if (await jobIsSelfAuthored(service, job)) return ignoreSelfAuthoredJob(service, job, "classifying");
    const [automations, replies] = await Promise.all([listSocialAutomations(), recentReplies(service)]);
    const explicitAutomation = findExplicitCommentAutomation(job.inbound_text, automations);
    const result = await prepareInstagramCommentDecision({
      comment: job.inbound_text,
      senderId: job.sender_id,
      externalEventId: job.external_event_id,
      explicitAutomation,
      recentReplies: replies,
      positiveRepliesEnabled: settings.positiveRepliesEnabled,
      publicKeywordAckEnabled: settings.publicKeywordAckEnabled
    });
    let prepared = result.prepared;
    if (await alreadyAnsweredContention(service, job, prepared)) {
      prepared = {
        ...prepared,
        action: "ignore",
        contentionLevel: "repetitive",
        publicReply: null,
        privateReply: null,
        destinationUrl: null,
        scriptureReferences: [],
        internalReason: "A prior doctrinal objection or gotcha from this person on this post already received one reply.",
        delaySeconds: 0
      };
    }

    const attributionToken = await personAttributionToken(service, job.person_id);
    const destinationUrl = attributedDestination(prepared.destinationUrl, attributionToken);
    const now = new Date().toISOString();
    const ignored = prepared.action === "ignore" || (!prepared.publicReply && !prepared.privateReply);
    const nextStatus = ignored ? "ignored" : settings.mode === "shadow" ? "shadowed" : "scheduled";
    const availableAt = new Date(Date.now() + prepared.delaySeconds * 1000).toISOString();
    const update = await service.from("social_comment_guide_jobs").update({
      status: nextStatus,
      intent: prepared.intent,
      action: prepared.action,
      contention_level: prepared.contentionLevel,
      confidence: prepared.confidence,
      automation_id: prepared.automationId,
      matched_keyword: prepared.matchedKeyword,
      pathway_slug: prepared.pathwaySlug,
      public_reply_text: prepared.publicReply,
      private_reply_text: prepared.privateReply,
      destination_url: destinationUrl,
      scripture_references: prepared.scriptureReferences,
      decision_json: prepared,
      doctrine_review_json: prepared.doctrineReview,
      model: result.model,
      prompt_version: COMMENT_GUIDE_PROMPT_VERSION,
      available_at: availableAt,
      locked_at: null,
      last_error: ignored ? prepared.internalReason : null,
      completed_at: ignored || settings.mode === "shadow" ? now : null,
      updated_at: now
    }).eq("id", job.id).eq("status", "classifying");
    if (update.error) throw new Error(update.error.message);
    await updateSocialEvent(service, job, {
      automation_id: prepared.automationId,
      matched_keyword: prepared.matchedKeyword,
      destination_url: destinationUrl,
      delivery_status: ignored || settings.mode === "shadow" ? "ignored" : "matched",
      error_code: ignored ? prepared.internalReason.slice(0, 500) : settings.mode === "shadow" ? "Comment Guide shadow mode" : null
    });
    return nextStatus;
  } catch (error) {
    const message = safeError(error);
    const failed = job.classification_attempts >= 5;
    const now = new Date().toISOString();
    await service.from("social_comment_guide_jobs").update({
      status: failed ? "failed" : "classification_retry",
      available_at: failed ? now : retryAt(job.classification_attempts, job.id),
      locked_at: null,
      last_error: message,
      completed_at: failed ? now : null,
      updated_at: now
    }).eq("id", job.id).eq("status", "classifying");
    if (failed) await updateSocialEvent(service, job, { delivery_status: "failed", error_code: message.slice(0, 500) });
    return failed ? "failed" : "classification_retry";
  }
}

async function graphFetch(path: string, config: NonNullable<Awaited<ReturnType<typeof getInstagramConfig>>>, body: Record<string, unknown>) {
  const response = await fetch(`https://graph.instagram.com/${config.graphVersion}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000)
  });
  const json = await response.json().catch(() => ({})) as { id?: string; message_id?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? `Instagram request failed (${response.status}).`);
  return json;
}

async function sendPrivateCommentReply(config: NonNullable<Awaited<ReturnType<typeof getInstagramConfig>>>, job: CommentGuideJob) {
  if (!job.private_reply_text) return null;
  const result = await graphFetch(`${encodeURIComponent(config.instagramUserId)}/messages`, config, {
    recipient: { comment_id: job.comment_id },
    message: { text: job.private_reply_text }
  });
  return result.message_id ?? result.id ?? "sent-without-provider-id";
}

async function sendPublicCommentReply(config: NonNullable<Awaited<ReturnType<typeof getInstagramConfig>>>, job: CommentGuideJob) {
  if (!job.public_reply_text) return null;
  const result = await graphFetch(`${encodeURIComponent(job.comment_id)}/replies`, config, { message: job.public_reply_text });
  return result.id ?? result.message_id ?? "sent-without-provider-id";
}

async function dailyLimitReached(service: ServiceClient, limit: number) {
  const result = await service.from("social_comment_guide_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("completed_at", startOfUtcDay());
  if (result.error) throw new Error(result.error.message);
  return (result.count ?? 0) >= limit;
}

async function recordDelivery(service: ServiceClient, job: CommentGuideJob) {
  const now = new Date().toISOString();
  await updateSocialEvent(service, job, {
    automation_id: job.automation_id,
    matched_keyword: job.matched_keyword,
    destination_url: job.destination_url,
    delivery_status: "sent",
    provider_message_id: job.private_reply_provider_id ?? job.public_reply_provider_id,
    error_code: null
  });
  if (!job.person_id) return;
  await recordPersonEvent({
    personId: job.person_id,
    eventType: "comment_guide_reply_sent",
    channel: "instagram",
    eventName: job.action === "deliver_keyword" ? "Instagram keyword guide sent" : "Instagram Comment Guide reply sent",
    automationId: job.automation_id,
    externalEventId: `crm:comment-guide:${job.external_event_id}`,
    metadata: {
      intent: job.intent,
      action: job.action,
      pathway_slug: job.pathway_slug,
      source_media_id: job.media_id,
      public_reply_provider_id: job.public_reply_provider_id,
      private_reply_provider_id: job.private_reply_provider_id,
      prompt_version: job.prompt_version
    },
    occurredAt: now
  });
}

async function deliverJob(service: ServiceClient, claimedJob: CommentGuideJob) {
  let job = claimedJob;
  try {
    if (await jobIsSelfAuthored(service, job)) return ignoreSelfAuthoredJob(service, job, "sending");
    const settings = await loadSettings(service);
    if (settings.mode !== "live") {
      const status = settings.mode === "shadow" ? "shadowed" : "ignored";
      const now = new Date().toISOString();
      await service.from("social_comment_guide_jobs").update({ status, locked_at: null, completed_at: now, last_error: `Comment Guide switched to ${settings.mode} before delivery.`, updated_at: now }).eq("id", job.id).eq("status", "sending");
      await updateSocialEvent(service, job, { delivery_status: "ignored", error_code: `Comment Guide ${settings.mode}` });
      return status;
    }
    if (await dailyLimitReached(service, settings.dailyReplyLimit)) {
      const now = new Date().toISOString();
      await service.from("social_comment_guide_jobs").update({ status: "ignored", locked_at: null, completed_at: now, last_error: "Daily automatic reply limit reached.", updated_at: now }).eq("id", job.id).eq("status", "sending");
      await updateSocialEvent(service, job, { delivery_status: "ignored", error_code: "Daily Comment Guide limit reached" });
      return "ignored";
    }

    const config = await getInstagramConfig();
    if (!config) throw new Error("Instagram is not configured.");

    if (job.private_reply_text && !job.private_reply_provider_id) {
      const privateReplyText = job.private_reply_text;
      const providerId = await sendPrivateCommentReply(config, job);
      const result = await service.from("social_comment_guide_jobs").update({ private_reply_provider_id: providerId, updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "sending").select(JOB_SELECT).single();
      if (result.error) throw new Error(result.error.message);
      job = result.data as unknown as CommentGuideJob;
      if (job.person_id) {
        await recordInboxOutbound({
          personId: job.person_id,
          body: privateReplyText,
          providerMessageId: providerId,
          externalEventId: `comment-guide-private:${job.external_event_id}`,
          kind: "automation",
          at: new Date().toISOString(),
          metadata: { automation_id: job.automation_id, pathway_slug: job.pathway_slug, signature_flow: job.destination_url ? "you-found-the-study" : null }
        });
      }
    }

    if (job.public_reply_text && !job.public_reply_provider_id) {
      const providerId = await sendPublicCommentReply(config, job);
      const result = await service.from("social_comment_guide_jobs").update({ public_reply_provider_id: providerId, updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "sending").select(JOB_SELECT).single();
      if (result.error) throw new Error(result.error.message);
      job = result.data as unknown as CommentGuideJob;
    }

    const now = new Date().toISOString();
    const update = await service.from("social_comment_guide_jobs").update({ status: "sent", locked_at: null, last_error: null, completed_at: now, updated_at: now }).eq("id", job.id).eq("status", "sending").select(JOB_SELECT).single();
    if (update.error) throw new Error(update.error.message);
    job = update.data as unknown as CommentGuideJob;
    await recordDelivery(service, job);
    return "sent";
  } catch (error) {
    const message = safeError(error);
    const failed = job.delivery_attempts >= 5;
    const now = new Date().toISOString();
    await service.from("social_comment_guide_jobs").update({
      status: failed ? "failed" : "delivery_retry",
      available_at: failed ? now : retryAt(job.delivery_attempts, job.id),
      locked_at: null,
      last_error: message,
      completed_at: failed ? now : null,
      updated_at: now
    }).eq("id", job.id).eq("status", "sending");
    if (failed) await updateSocialEvent(service, job, { delivery_status: "failed", error_code: message.slice(0, 500) });
    return failed ? "failed" : "delivery_retry";
  }
}

export async function runCommentGuideCycle(input: { classifyLimit?: number; deliveryLimit?: number } = {}) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  await recoverStaleClaims(service);
  const settings = await loadSettings(service);
  if (settings.mode === "paused") return { mode: settings.mode, classified: 0, delivered: 0, ignored: 0, failed: 0 };

  let classified = 0;
  let delivered = 0;
  let ignored = 0;
  let failed = 0;

  for (let index = 0; index < Math.min(input.deliveryLimit ?? 12, 30); index += 1) {
    const job = await claimJob(service, ["scheduled", "delivery_retry"], "sending");
    if (!job) break;
    const status = await deliverJob(service, job);
    if (status === "sent") delivered += 1;
    if (status === "ignored" || status === "shadowed") ignored += 1;
    if (status === "failed") failed += 1;
  }

  for (let index = 0; index < Math.min(input.classifyLimit ?? 8, 20); index += 1) {
    const job = await claimJob(service, ["received", "classification_retry"], "classifying");
    if (!job) break;
    const status = await classifyJob(service, job, settings);
    if (["scheduled", "shadowed", "ignored"].includes(status)) classified += 1;
    if (status === "shadowed" || status === "ignored") ignored += 1;
    if (status === "failed") failed += 1;
  }

  return { mode: settings.mode, classified, delivered, ignored, failed };
}

export async function getCommentGuideDashboard(limit = 30): Promise<CommentGuideDashboard> {
  const service = createServiceClient();
  if (!service) return { dbReady: false, error: "Supabase service access is not configured.", settings: DEFAULT_SETTINGS, metrics: { receivedToday: 0, repliedToday: 0, shadowedToday: 0, failed: 0 }, recentJobs: [] };
  const settingsResult = await service.from("social_comment_guide_settings").select("*").eq("id", 1).maybeSingle();
  if (settingsResult.error) return { dbReady: false, error: settingsResult.error.message, settings: DEFAULT_SETTINGS, metrics: { receivedToday: 0, repliedToday: 0, shadowedToday: 0, failed: 0 }, recentJobs: [] };
  const today = startOfUtcDay();
  const [received, replied, shadowed, failed, jobs] = await Promise.all([
    service.from("social_comment_guide_jobs").select("id", { count: "exact", head: true }).gte("created_at", today),
    service.from("social_comment_guide_jobs").select("id", { count: "exact", head: true }).eq("status", "sent").gte("completed_at", today),
    service.from("social_comment_guide_jobs").select("id", { count: "exact", head: true }).eq("status", "shadowed").gte("completed_at", today),
    service.from("social_comment_guide_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    service.from("social_comment_guide_jobs").select(JOB_SELECT).order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 100))
  ]);
  const queryError = received.error || replied.error || shadowed.error || failed.error || jobs.error;
  return {
    dbReady: !queryError,
    error: queryError?.message ?? null,
    settings: settingsFromRow(settingsResult.data as Record<string, unknown> | null),
    metrics: { receivedToday: received.count ?? 0, repliedToday: replied.count ?? 0, shadowedToday: shadowed.count ?? 0, failed: failed.count ?? 0 },
    recentJobs: (jobs.data ?? []) as unknown as CommentGuideJob[]
  };
}

export async function updateCommentGuideSettings(input: {
  mode: CommentGuideMode;
  positiveRepliesEnabled: boolean;
  publicKeywordAckEnabled: boolean;
  dailyReplyLimit: number;
  updatedBy: string;
}) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const now = new Date().toISOString();
  const result = await service.from("social_comment_guide_settings").upsert({
    id: 1,
    mode: input.mode,
    model: COMMENT_GUIDE_MODEL,
    positive_replies_enabled: input.positiveRepliesEnabled,
    public_keyword_ack_enabled: input.publicKeywordAckEnabled,
    daily_reply_limit: Math.min(Math.max(input.dailyReplyLimit, 1), 5000),
    updated_by: input.updatedBy,
    updated_at: now
  }, { onConflict: "id" }).select("*").single();
  if (result.error) throw new Error(result.error.message);
  if (input.mode === "paused") {
    const pending = await service.from("social_comment_guide_jobs").select("external_event_id").in("status", ["received", "classification_retry", "scheduled", "delivery_retry"]);
    if (pending.error) throw new Error(pending.error.message);
    const paused = await service.from("social_comment_guide_jobs").update({ status: "ignored", completed_at: now, locked_at: null, last_error: "Comment Guide paused before delivery.", updated_at: now }).in("status", ["received", "classification_retry", "scheduled", "delivery_retry"]);
    if (paused.error) throw new Error(paused.error.message);
    const externalEventIds = (pending.data ?? []).map((row) => String(row.external_event_id)).filter(Boolean);
    if (externalEventIds.length) {
      const events = await service.from("social_events").update({ delivery_status: "ignored", error_code: "Comment Guide paused" }).in("external_event_id", externalEventIds);
      if (events.error) throw new Error(events.error.message);
    }
  }
  return settingsFromRow(result.data as Record<string, unknown>);
}

export async function simulateInstagramCommentGuide(comment: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const [settings, automations, replies] = await Promise.all([loadSettings(service), listSocialAutomations(), recentReplies(service)]);
  const explicitAutomation = findExplicitCommentAutomation(comment, automations);
  const result = await prepareInstagramCommentDecision({
    comment,
    senderId: "admin-simulation",
    externalEventId: `simulation:${createSimulationSeed(comment)}`,
    explicitAutomation,
    recentReplies: replies,
    positiveRepliesEnabled: settings.positiveRepliesEnabled,
    publicKeywordAckEnabled: settings.publicKeywordAckEnabled
  });
  return {
    model: result.model,
    promptVersion: COMMENT_GUIDE_PROMPT_VERSION,
    explicitKeywordGate: explicitAutomation ? { automationId: explicitAutomation.automation.id, keyword: explicitAutomation.keyword } : null,
    decision: result.prepared
  };
}

function createSimulationSeed(comment: string) {
  let value = 0;
  for (let index = 0; index < comment.length; index += 1) value = (value * 31 + comment.charCodeAt(index)) >>> 0;
  return value.toString(36);
}

export async function retryCommentGuideJob(jobId: number) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const existing = await service.from("social_comment_guide_jobs").select(JOB_SELECT).eq("id", jobId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) throw new Error("Comment Guide job not found.");
  const job = existing.data as unknown as CommentGuideJob;
  if (job.status !== "failed") throw new Error("Only failed Comment Guide jobs can be retried.");
  const nextStatus = job.public_reply_text || job.private_reply_text ? "delivery_retry" : "classification_retry";
  const result = await service.from("social_comment_guide_jobs").update({ status: nextStatus, available_at: new Date().toISOString(), completed_at: null, locked_at: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "failed");
  if (result.error) throw new Error(result.error.message);
  await updateSocialEvent(service, job, { delivery_status: job.public_reply_text || job.private_reply_text ? "matched" : "received", error_code: null });
  return { id: jobId, status: nextStatus, externalEventId: job.external_event_id };
}

export function canSendCommentGuideJobNow(status: string) {
  return status === "scheduled" || status === "delivery_retry";
}

export function canDeleteCommentGuideJob(status: string) {
  return status !== "classifying" && status !== "sending";
}

export async function sendCommentGuideJobNow(jobId: number) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const settings = await loadSettings(service);
  if (settings.mode !== "live") throw new Error("Comment Guide must be Live before a reply can be sent now.");
  const existing = await service.from("social_comment_guide_jobs").select(JOB_SELECT).eq("id", jobId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) throw new Error("Comment Guide job not found.");
  const job = existing.data as unknown as CommentGuideJob;
  if (!canSendCommentGuideJobNow(job.status)) throw new Error("Only scheduled replies or delivery retries can be sent now.");
  if (!job.public_reply_text && !job.private_reply_text) throw new Error("This job has no approved reply to send.");
  const now = new Date().toISOString();
  const claimed = await service.from("social_comment_guide_jobs").update({
    status: "sending",
    available_at: now,
    locked_at: now,
    delivery_attempts: Number(job.delivery_attempts ?? 0) + 1,
    updated_at: now
  }).eq("id", jobId).in("status", ["scheduled", "delivery_retry"]).select(JOB_SELECT).maybeSingle();
  if (claimed.error) throw new Error(claimed.error.message);
  if (!claimed.data) throw new Error("That reply is already being processed. Refresh the log before trying again.");
  const status = await deliverJob(service, claimed.data as unknown as CommentGuideJob);
  return { id: jobId, status, externalEventId: job.external_event_id };
}

export async function deleteCommentGuideJob(jobId: number) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const existing = await service.from("social_comment_guide_jobs").select("id,status,external_event_id").eq("id", jobId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) return { id: jobId, status: null, externalEventId: null, alreadyDeleted: true };
  if (!canDeleteCommentGuideJob(String(existing.data.status))) throw new Error("This comment is being processed right now. Wait a moment, then delete it.");
  const removed = await service.from("social_comment_guide_jobs")
    .delete()
    .eq("id", jobId)
    .eq("status", existing.data.status)
    .select("id")
    .maybeSingle();
  if (removed.error) throw new Error(removed.error.message);
  if (!removed.data) throw new Error("The comment changed while it was being deleted. Refresh the log and try again.");
  return {
    id: jobId,
    status: String(existing.data.status),
    externalEventId: typeof existing.data.external_event_id === "string" ? existing.data.external_event_id : null,
    alreadyDeleted: false
  };
}

export const commentGuideRuntimeMetadata = {
  model: COMMENT_GUIDE_MODEL,
  promptVersion: COMMENT_GUIDE_PROMPT_VERSION
};

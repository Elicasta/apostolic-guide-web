import { randomUUID } from "node:crypto";
import { SOL_RECIPE_STEPS, solProgress, type SolRecipeKey } from "./sol-operator-engine";
import {
  isTransientSolFailure,
  SOL_RUN_LEASE_MS,
  SOL_RUN_REQUEST_TIMEOUT_MS,
  solRetryDelayMs
} from "./sol-run-recovery";
import { createServiceClient } from "./supabase";

type ExecutionContext = { origin: string; cookie: string };
type Service = NonNullable<ReturnType<typeof createServiceClient>>;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function requestJson(context: ExecutionContext, path: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOL_RUN_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${context.origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: context.cookie },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof data.error === "string" ? `${data.error} (${response.status})` : `${path} failed (${response.status}).`);
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(`${path} timed out after ${Math.round(SOL_RUN_REQUEST_TIMEOUT_MS / 1000)} seconds.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function loadRun(service: Service, runId: string) {
  const result = await service.from("sol_operator_runs").select("*").eq("id", runId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Sol run not found.");
  return result.data as Record<string, unknown>;
}

async function appendEvent(service: Service, run: Record<string, unknown>, eventType: string, detail: Record<string, unknown> = {}) {
  const result = await service.from("sol_operator_events").insert({ run_id: run.id, proposal_id: run.proposal_id ?? null, event_type: eventType, detail });
  if (result.error) console.error("Sol run event write failed", result.error.message);
}

async function cancelled(service: Service, runId: string) {
  const result = await service.from("sol_operator_runs").select("status").eq("id", runId).maybeSingle();
  return result.data?.status === "cancelled";
}

async function heartbeat(service: Service, run: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const now = new Date();
  const lease = new Date(now.getTime() + SOL_RUN_LEASE_MS).toISOString();
  const values = { heartbeat_at: now.toISOString(), last_progress_at: now.toISOString(), lease_expires_at: lease, ...extra };
  const result = await service.from("sol_operator_runs").update(values).eq("id", run.id).eq("status", "running");
  if (result.error) throw result.error;
  run.heartbeat_at = values.heartbeat_at;
  run.last_progress_at = values.last_progress_at;
  run.lease_expires_at = values.lease_expires_at;
}

async function updateStep(service: Service, run: Record<string, unknown>, stepKey: string, status: "running" | "completed" | "failed", detail?: string) {
  const recipe = String(run.recipe_key) as SolRecipeKey;
  const definition = SOL_RECIPE_STEPS[recipe];
  const current = Array.isArray(run.steps) ? run.steps as Array<Record<string, unknown>> : definition.map((step) => ({ ...step, status: "pending" }));
  const steps = current.map((step) => step.key === stepKey ? { ...step, status, ...(detail ? { detail } : {}) } : step);
  run.steps = steps;
  const completed = steps.filter((step) => step.status === "completed").length;
  const progress = status === "failed" ? Number(run.progress) || 0 : solProgress(completed, steps.length);
  run.current_step = stepKey;
  run.progress = progress;
  await heartbeat(service, run, { steps, current_step: stepKey, progress });
  await appendEvent(service, run, `step.${status}`, { step_key: stepKey, detail: detail ?? null, progress });
}

async function finishRun(service: Service, run: Record<string, unknown>, values: Record<string, unknown>) {
  const now = new Date().toISOString();
  const result = await service.from("sol_operator_runs").update({
    ...values,
    heartbeat_at: now,
    last_progress_at: now,
    lease_expires_at: null,
    next_retry_at: null,
    worker_id: null
  }).eq("id", run.id).neq("status", "cancelled");
  if (result.error) throw result.error;
}

async function settleProposal(service: Service, proposalId: string | null) {
  if (!proposalId) return;
  const runs = await service.from("sol_operator_runs").select("status").eq("proposal_id", proposalId);
  if (runs.error || !runs.data?.length) return;
  if (runs.data.some((item) => ["queued", "running", "retrying"].includes(String(item.status)))) return;
  const failedOnly = runs.data.every((item) => ["failed", "stalled", "cancelled"].includes(String(item.status)));
  await service.from("sol_operator_proposals").update({ status: failedOnly ? "failed" : "completed" }).eq("id", proposalId);
}

async function audioToYoutube(service: Service, run: Record<string, unknown>, context: ExecutionContext) {
  const inputs = record(run.inputs);
  const slug = String(inputs.slug || run.pathway_slug || "");
  if (!slug) throw new Error("Pathway slug is missing.");

  await updateStep(service, run, "validate_source", "running");
  const [audio, script] = await Promise.all([
    service.from("pathway_audio_assets").select("audio_url,content_hash").eq("pathway_slug", slug).maybeSingle(),
    service.from("pathway_audio_scripts").select("script_hash,status,checker_status,checked_script_hash").eq("pathway_slug", slug).maybeSingle()
  ]);
  if (audio.error) throw audio.error;
  if (script.error) throw script.error;
  if (!audio.data?.audio_url || !script.data?.script_hash || script.data.status !== "approved") throw new Error("Approved Pathway audio is missing.");
  if (script.data.checker_status !== "passed" || script.data.checked_script_hash !== script.data.script_hash) throw new Error("The exact approved script has not passed the theology checker.");
  if (audio.data.content_hash !== script.data.script_hash) throw new Error("The audio does not match the approved script. Regenerate it first.");
  await updateStep(service, run, "validate_source", "completed", "Exact script hash, theology verdict, and audio hash match.");
  if (await cancelled(service, String(run.id))) return;

  await updateStep(service, run, "analyze_video", "running");
  const analysis = await requestJson(context, "/api/admin/video-studio/analyze", { slug, force: false });
  await updateStep(service, run, "analyze_video", "completed", analysis.analyzed === false ? "Existing aligned project reused." : "Timed video project created.");
  if (await cancelled(service, String(run.id))) return;

  await updateStep(service, run, "publishing_kit", "running");
  const kit = await requestJson(context, "/api/admin/video-studio/publishing-kit", { slug, action: "generate" });
  await updateStep(service, run, "publishing_kit", "completed", "YouTube copy and thumbnail direction saved.");
  if (await cancelled(service, String(run.id))) return;

  await updateStep(service, run, "queue_render", "running");
  const existingRender = await service.from("pathway_video_renders")
    .select("id,status,output_url")
    .eq("pathway_slug", slug)
    .eq("format", "youtube")
    .in("status", ["queued", "rendering", "completed"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingRender.error) throw existingRender.error;
  let renderRows: Array<Record<string, unknown>>;
  if (existingRender.data) {
    renderRows = [existingRender.data as Record<string, unknown>];
    await updateStep(service, run, "queue_render", "completed", `Existing ${existingRender.data.status} YouTube render reused.`);
  } else {
    const rendering = await requestJson(context, "/api/admin/video-studio/render", { slug, formats: ["youtube"], replaceExisting: false });
    renderRows = Array.isArray(rendering.renders) ? rendering.renders as Array<Record<string, unknown>> : [];
    await updateStep(service, run, "queue_render", "completed", `${renderRows.length || 1} YouTube render queued.`);
  }
  await updateStep(service, run, "review", "completed", "Sol stopped before publishing.");
  await finishRun(service, run, {
    status: "waiting_review",
    progress: 100,
    current_step: "review",
    result: { slug, project: analysis.project ?? null, kit: kit.kit ?? null, renderIds: renderRows.map((item) => item.id), href: `/admin/video-studio?pathway=${encodeURIComponent(slug)}`, publishingBlocked: true },
    completed_at: new Date().toISOString(),
    error: null
  });
}

async function carouselTopicPack(service: Service, run: Record<string, unknown>, context: ExecutionContext) {
  const inputs = record(run.inputs);
  const slug = String(inputs.slug || run.pathway_slug || "");
  const topics = Array.isArray(inputs.topics) ? inputs.topics as Array<Record<string, unknown>> : [];
  if (!slug || !topics.length) throw new Error("Carousel topic inputs are missing.");
  await updateStep(service, run, "build_topics", "completed", `${topics.length} canonical topics prepared.`);

  const saved: Array<Record<string, unknown>> = Array.isArray(record(run.result).drafts) ? record(run.result).drafts as Array<Record<string, unknown>> : [];
  await updateStep(service, run, "generate_decks", "running");
  for (let index = saved.length; index < topics.length; index += 1) {
    if (await cancelled(service, String(run.id))) return;
    const topic = topics[index];
    const generated = await requestJson(context, "/api/admin/carousel-studio/generate", { slug, mode: "pathway", prompt: String(topic.prompt || topic.title || "Create a Pathway carousel."), targetSlides: 8 });
    const plan = record(generated.plan);
    const rawSlides = Array.isArray(plan.slides) ? plan.slides as Array<Record<string, unknown>> : [];
    if (!rawSlides.length) throw new Error(`Carousel ${index + 1} returned no slides.`);
    const slides = rawSlides.map((slide, slideIndex) => ({ id: String(slideIndex + 1).padStart(2, "0"), ...slide }));
    const checked = await requestJson(context, "/api/admin/carousel-studio/check-doctrine", { slug, mode: "pathway", prompt: String(topic.prompt || ""), slides });
    const review = record(checked.review);
    const verdict = String(review.status || "blocked");
    const status = verdict === "pass" ? "ready_to_produce" : verdict === "warning" ? "script" : "blocked";
    const insert = await service.from("pathway_assets").insert({
      pathway_slug: slug,
      type: "carousel",
      title: String(plan.title || topic.title || `Carousel ${index + 1}`),
      language: "en",
      status,
      platform: "instagram",
      hook: String(rawSlides[0]?.title || topic.title || ""),
      cta_type: "visit_pathway",
      destination_url: `https://www.apostolicguide.com/pathways/${slug}`,
      notes: JSON.stringify({ source: "sol-content-operator", recipe: "carousel_topic_pack", solRunId: run.id, topicIndex: index, topic, plan, doctrineReview: review, model: generated.model ?? null, createdAt: new Date().toISOString() })
    }).select("id,title,status").single();
    if (insert.error) throw insert.error;
    saved.push({ ...insert.data, doctrineStatus: verdict });
    const progress = Math.min(78, 20 + Math.round(((index + 1) / topics.length) * 58));
    run.progress = progress;
    run.result = { drafts: saved };
    await heartbeat(service, run, { progress, result: { drafts: saved } });
  }
  await updateStep(service, run, "generate_decks", "completed", `${saved.length} carousel plans generated.`);
  await updateStep(service, run, "theology_check", "completed", "Every saved deck has a doctrine verdict attached.");
  await updateStep(service, run, "save_drafts", "completed", `${saved.length} reviewable assets saved.`);
  await updateStep(service, run, "review", "completed", "Sol stopped before export or publishing.");
  await finishRun(service, run, {
    status: "waiting_review",
    progress: 100,
    current_step: "review",
    result: { slug, drafts: saved, href: `/admin/pathways/${encodeURIComponent(slug)}`, publishingBlocked: true },
    completed_at: new Date().toISOString(),
    error: null
  });
}

async function journeyAutomationDraft(service: Service, run: Record<string, unknown>) {
  const inputs = record(run.inputs);
  const slug = String(inputs.slug || run.pathway_slug || "");
  const title = String(inputs.title || slug);
  const keyword = String(inputs.keyword || "").trim();
  const destinationUrl = String(inputs.destinationUrl || `https://www.apostolicguide.com/pathways/${slug}`);
  if (!slug || !keyword) throw new Error("Pathway keyword is missing.");
  await updateStep(service, run, "verify_keyword", "completed", `Keyword “${keyword}” and destination verified.`);

  await updateStep(service, run, "create_automation", "running");
  const automationName = `${title} Pathway · ${keyword.toUpperCase()}`;
  const existingAutomation = await service.from("social_automations").select("id,name").eq("name", automationName).eq("enabled", false).maybeSingle();
  if (existingAutomation.error) throw existingAutomation.error;
  const automation = existingAutomation.data ? { data: existingAutomation.data } : await service.from("social_automations").insert({
    name: automationName,
    platform: "instagram",
    trigger_type: "comment_keyword",
    keywords: [keyword],
    match_type: "exact",
    reply_text: `Here is the ${title} Scripture Pathway. Check your DMs for the study link.`,
    destination_url: destinationUrl,
    enabled: false,
    created_by: "Sol Content Operator"
  }).select("id,name").single();
  if (!automation.data) throw new Error("Unable to create or reuse the draft automation.");
  await updateStep(service, run, "create_automation", "completed", existingAutomation.data ? "Existing disabled Meta automation reused." : "Disabled Meta automation created.");

  await updateStep(service, run, "create_journey", "running");
  const journeyName = `${title} Pathway follow-up`;
  const existingJourney = await service.from("growth_journeys").select("id,name").eq("name", journeyName).eq("status", "draft").maybeSingle();
  if (existingJourney.error) throw existingJourney.error;
  const journey = existingJourney.data ? { data: existingJourney.data } : await service.from("growth_journeys").insert({
    name: journeyName,
    description: `Draft follow-up journey for people who request the ${title} Pathway with the keyword ${keyword}.`,
    status: "draft",
    trigger_type: "instagram_comment_keyword",
    trigger_config: { keywords: [keyword], match_type: "exact", automation_id: automation.data.id, pathway_slug: slug },
    created_by: "Sol Content Operator"
  }).select("id,name").single();
  if (!journey.data) throw new Error("Unable to create or reuse the draft journey.");
  await updateStep(service, run, "create_journey", "completed", existingJourney.data ? "Existing draft journey reused with no enrollments." : "Draft journey created with no enrollments.");

  await updateStep(service, run, "link_project", "running");
  const linked = await service.from("pathway_publishing_profiles").upsert({ pathway_slug: slug, primary_keyword: keyword, app_url: destinationUrl, social_automation_id: automation.data.id }, { onConflict: "pathway_slug" });
  if (linked.error) throw linked.error;
  await updateStep(service, run, "link_project", "completed", "Draft automation linked to the Pathway project.");
  await updateStep(service, run, "review", "completed", "Sol stopped before activation or enrollment.");
  await finishRun(service, run, {
    status: "waiting_review",
    progress: 100,
    current_step: "review",
    result: { slug, automationId: automation.data.id, journeyId: journey.data.id, href: "/admin/social", activationBlocked: true },
    completed_at: new Date().toISOString(),
    error: null
  });
}

export async function executeSolRun(runId: string, context: ExecutionContext) {
  const service = createServiceClient();
  if (!service) return;
  let run: Record<string, unknown> | null = null;
  try {
    run = await loadRun(service, runId);
    if (!["queued", "retrying"].includes(String(run.status))) return;
    if (run.status === "retrying" && run.next_retry_at && Date.parse(String(run.next_retry_at)) > Date.now()) return;
    const attemptCount = (Number(run.attempt_count) || 0) + 1;
    const workerId = randomUUID();
    const now = new Date();
    const claimed = await service.from("sol_operator_runs").update({
      status: "running",
      started_at: now.toISOString(),
      heartbeat_at: now.toISOString(),
      last_progress_at: now.toISOString(),
      lease_expires_at: new Date(now.getTime() + SOL_RUN_LEASE_MS).toISOString(),
      next_retry_at: null,
      worker_id: workerId,
      attempt_count: attemptCount,
      error: null
    }).eq("id", runId).in("status", ["queued", "retrying"]).select("id").maybeSingle();
    if (claimed.error || !claimed.data) return;
    run.status = "running";
    run.attempt_count = attemptCount;
    run.worker_id = workerId;
    await appendEvent(service, run, "run.started", { recipe_key: run.recipe_key, pathway_slug: run.pathway_slug, attempt_count: attemptCount, worker_id: workerId });
    const recipe = String(run.recipe_key) as SolRecipeKey;
    if (recipe === "audio_to_youtube") await audioToYoutube(service, run, context);
    else if (recipe === "carousel_topic_pack") await carouselTopicPack(service, run, context);
    else await journeyAutomationDraft(service, run);
    const final = await loadRun(service, runId);
    await appendEvent(service, run, "run.finished", { status: final.status, result: final.result, attempt_count: attemptCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sol run failed.";
    if (run && !(await cancelled(service, runId))) {
      const stepKey = String(run.current_step || "unknown");
      try { await updateStep(service, run, stepKey, "failed", message); } catch {}
      const attemptCount = Number(run.attempt_count) || 1;
      const maxAttempts = Math.max(1, Number(run.max_attempts) || 3);
      if (isTransientSolFailure(message) && attemptCount < maxAttempts) {
        const nextRetryAt = new Date(Date.now() + solRetryDelayMs(attemptCount)).toISOString();
        await service.from("sol_operator_runs").update({
          status: "retrying",
          error: message.slice(0, 1800),
          next_retry_at: nextRetryAt,
          lease_expires_at: null,
          worker_id: null
        }).eq("id", runId).neq("status", "cancelled");
        await appendEvent(service, run, "run.retry_scheduled", { error: message, next_retry_at: nextRetryAt, attempt_count: attemptCount, max_attempts: maxAttempts });
      } else {
        await service.from("sol_operator_runs").update({
          status: "failed",
          error: message.slice(0, 1800),
          completed_at: new Date().toISOString(),
          lease_expires_at: null,
          worker_id: null
        }).eq("id", runId).neq("status", "cancelled");
        await appendEvent(service, run, "run.failed", { error: message, attempt_count: attemptCount, max_attempts: maxAttempts });
      }
    }
  } finally {
    const proposalId = run?.proposal_id ? String(run.proposal_id) : null;
    await settleProposal(service, proposalId);
  }
}

export async function executeSolRuns(runIds: string[], context: ExecutionContext) {
  const queue = [...new Set(runIds)];
  const workerCount = Math.min(2, queue.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      const runId = queue.shift();
      if (runId) await executeSolRun(runId, context);
    }
  }));
}

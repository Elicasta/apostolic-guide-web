import { SOL_RECIPE_STEPS, solProgress, type SolRecipeKey } from "./sol-operator-engine";
import { createLegacyRuntimeReview } from "./sol-runtime-review";
import { createServiceClient } from "./supabase";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function artifactForRun(run: Record<string, unknown>) {
  const recipe = String(run.recipe_key) as SolRecipeKey;
  const slug = String(run.pathway_slug || record(run.inputs).slug || "workspace");
  const result = record(run.result);
  if (recipe === "audio_to_youtube") return {
    type: "youtube_preparation_package",
    title: `${slug} YouTube package`,
    location: typeof result.href === "string" && !result.href.startsWith("/admin/sol/reviews/") ? result.href : `/admin/video-studio?pathway=${encodeURIComponent(slug)}`,
    metadata: { renderIds: Array.isArray(result.renderIds) ? result.renderIds : [], adopted: true, publishingBlocked: true }
  };
  if (recipe === "carousel_topic_pack") return {
    type: "carousel_package",
    title: `${slug} carousel package`,
    location: typeof result.href === "string" && !result.href.startsWith("/admin/sol/reviews/") ? result.href : `/admin/pathways/${encodeURIComponent(slug)}`,
    metadata: { drafts: Array.isArray(result.drafts) ? result.drafts : [], adopted: true, publishingBlocked: true }
  };
  return {
    type: "keyword_automation_draft",
    title: `${slug} keyword automation`,
    location: typeof result.href === "string" && !result.href.startsWith("/admin/sol/reviews/") ? result.href : "/admin/social",
    metadata: { automationId: result.automationId ?? null, journeyId: result.journeyId ?? null, adopted: true, activationBlocked: true }
  };
}

export async function adoptLegacyWaitingReviews(limit = 40) {
  const service = createServiceClient();
  if (!service) return { adopted: 0 };
  const waiting = await service.from("sol_operator_runs")
    .select("*")
    .eq("status", "waiting_review")
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (waiting.error) {
    if (waiting.error.code === "42P01") return { adopted: 0 };
    throw waiting.error;
  }

  let adopted = 0;
  for (const raw of waiting.data ?? []) {
    const run = raw as Record<string, unknown>;
    const result = record(run.result);
    if (typeof result.reviewId === "string" && result.reviewId) continue;
    const recipe = String(run.recipe_key) as SolRecipeKey;
    if (!SOL_RECIPE_STEPS[recipe]) continue;
    const definition = SOL_RECIPE_STEPS[recipe];
    const current = Array.isArray(run.steps) ? run.steps as Array<Record<string, unknown>> : definition.map((step) => ({ ...step, status: "pending" }));
    const steps = current.map((step) => String(step.key) === "review" ? { ...step, status: "waiting_for_approval", detail: "Adopted into SOL Runtime review." } : step);
    const progress = solProgress(steps.filter((step) => step.status === "completed").length, steps.length);
    const artifact = artifactForRun(run);
    run.steps = steps;
    run.progress = progress;
    run.current_step = "review";
    run.result = result;
    const runtime = await createLegacyRuntimeReview({
      legacyRun: run,
      artifact: { ...artifact, storageType: "database", verificationStatus: "passed" },
      requestedAction: `Review ${artifact.title}`
    });
    const updated = await service.from("sol_operator_runs").update({
      progress,
      current_step: "review",
      steps,
      completed_at: null,
      result: { ...result, runtimeRunId: runtime.runtimeRunId, reviewId: runtime.reviewId, reviewStatus: "pending", href: `/admin/sol/reviews/${runtime.reviewId}` }
    }).eq("id", run.id).eq("status", "waiting_review");
    if (updated.error) throw updated.error;
    adopted += 1;
  }
  return { adopted };
}

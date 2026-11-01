import { pathwayNarrationHash } from "./pathway-audio";
import { allPathways } from "./pathway-catalog";
import { recordStudioAudit } from "./studio-audit";
import { createServiceClient } from "./supabase";
import {
  buildSolOperatorAnalysis,
  SOL_RECIPE_STEPS,
  type SolKpiTarget,
  type SolMode,
  type SolOperatorAnalysis,
  type SolPlanStep,
  type SolProposalRisk,
  type SolProposalStatus,
  type SolRecipeKey,
  type SolRunStatus
} from "./sol-operator-engine";

export type SolSettings = {
  enabled: boolean;
  mode: SolMode;
  weeklyTargets: Record<string, number>;
  allowLivePublishing: false;
  allowAutomationActivation: false;
  maxConcurrentRuns: number;
  lastScanAt: string | null;
};

export type SolProposal = {
  id: string;
  proposalKey: string;
  recipeKey: SolRecipeKey;
  title: string;
  summary: string;
  status: SolProposalStatus;
  priority: "urgent" | "high" | "medium" | "low";
  risk: SolProposalRisk;
  pathwaySlugs: string[];
  evidence: Array<{ label: string; value: string | number; state?: string }>;
  plan: SolPlanStep[];
  inputs: Record<string, unknown>;
  suggestedConstraints: string[];
  approvalConstraints: string[];
  createdAt: string;
  updatedAt: string;
};

export type SolRun = {
  id: string;
  proposalId: string | null;
  recipeKey: SolRecipeKey;
  pathwaySlug: string | null;
  status: SolRunStatus;
  progress: number;
  currentStep: string | null;
  inputs: Record<string, unknown>;
  steps: Array<{ key: string; label: string; status: string; detail?: string }>;
  result: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SolOperatorSnapshot = {
  dbReady: boolean;
  aiReady: boolean;
  rendererReady: boolean;
  settings: SolSettings;
  proposals: SolProposal[];
  runs: SolRun[];
  kpis: SolKpiTarget[];
  coverage: SolOperatorAnalysis["coverage"];
  generatedAt: string;
};

const DEFAULT_TARGETS = { youtube: 1, carousel: 3, short_video: 4, post: 5 };
const DEFAULT_SETTINGS: SolSettings = {
  enabled: false,
  mode: "watch",
  weeklyTargets: DEFAULT_TARGETS,
  allowLivePublishing: false,
  allowAutomationActivation: false,
  maxConcurrentRuns: 1,
  lastScanAt: null
};

const CURRENT_RUN_STATUSES: SolRunStatus[] = ["queued", "running", "retrying", "waiting_review", "failed", "stalled"];

type Service = NonNullable<ReturnType<typeof createServiceClient>>;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function proposalFromRow(row: Record<string, unknown>): SolProposal {
  return {
    id: String(row.id),
    proposalKey: String(row.proposal_key),
    recipeKey: String(row.recipe_key) as SolRecipeKey,
    title: String(row.title),
    summary: String(row.summary),
    status: String(row.status) as SolProposalStatus,
    priority: String(row.priority) as SolProposal["priority"],
    risk: String(row.risk) as SolProposalRisk,
    pathwaySlugs: stringArray(row.pathway_slugs),
    evidence: Array.isArray(row.evidence) ? row.evidence as SolProposal["evidence"] : [],
    plan: Array.isArray(row.plan) ? row.plan as SolPlanStep[] : [],
    inputs: record(row.inputs),
    suggestedConstraints: stringArray(row.suggested_constraints),
    approvalConstraints: stringArray(row.approval_constraints),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function runFromRow(row: Record<string, unknown>): SolRun {
  return {
    id: String(row.id),
    proposalId: row.proposal_id ? String(row.proposal_id) : null,
    recipeKey: String(row.recipe_key) as SolRecipeKey,
    pathwaySlug: row.pathway_slug ? String(row.pathway_slug) : null,
    status: String(row.status) as SolRunStatus,
    progress: Number(row.progress) || 0,
    currentStep: row.current_step ? String(row.current_step) : null,
    inputs: record(row.inputs),
    steps: Array.isArray(row.steps) ? row.steps as SolRun["steps"] : [],
    result: record(row.result),
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

async function getSettings(service: Service): Promise<SolSettings> {
  const result = await service.from("sol_operator_settings").select("*").eq("workspace_key", "apostolic-guide").maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    const created = await service.from("sol_operator_settings").insert({ workspace_key: "apostolic-guide" }).select("*").single();
    if (created.error) throw created.error;
    return getSettings(service);
  }
  return {
    enabled: result.data.enabled === true,
    mode: String(result.data.mode) as SolMode,
    weeklyTargets: { ...DEFAULT_TARGETS, ...record(result.data.weekly_targets) } as Record<string, number>,
    allowLivePublishing: false,
    allowAutomationActivation: false,
    maxConcurrentRuns: Math.max(1, Math.min(3, Number(result.data.max_concurrent_runs) || 1)),
    lastScanAt: result.data.last_scan_at ? String(result.data.last_scan_at) : null
  };
}

function appDestination(slug: string, appSlug: string) {
  return `https://app.apostolicguide.com/paths/${appSlug}?source=website&origin=website-pathway-${slug}`;
}

async function reconcileDuplicateReviewRuns(service: Service) {
  const result = await service.from("sol_operator_runs")
    .select("id,recipe_key,pathway_slug,updated_at,result")
    .eq("status", "waiting_review")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (result.error) throw result.error;
  const seen = new Set<string>();
  let superseded = 0;
  for (const row of result.data ?? []) {
    const key = `${String(row.recipe_key)}:${String(row.pathway_slug || "workspace")}`;
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }
    const previous = record(row.result);
    const updated = await service.from("sol_operator_runs").update({
      status: "cancelled",
      current_step: null,
      completed_at: new Date().toISOString(),
      result: { ...previous, superseded: true, supersededReason: "A newer review run owns this recipe and Pathway." }
    }).eq("id", row.id).eq("status", "waiting_review");
    if (updated.error) throw updated.error;
    superseded += 1;
  }
  return superseded;
}

async function observe(service: Service, weeklyTargets: Record<string, number>) {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [profiles, publications, audio, scripts, projects, renders, runs, calendar, creatives] = await Promise.all([
    service.from("pathway_publishing_profiles").select("pathway_slug,primary_keyword,campaign_status,app_url,social_automation_id"),
    service.from("pathway_publications").select("pathway_slug,platform,status,published_at"),
    service.from("pathway_audio_assets").select("pathway_slug,content_hash,audio_url"),
    service.from("pathway_audio_scripts").select("pathway_slug,source_hash,script_hash,status,checker_status,checked_script_hash"),
    service.from("pathway_video_projects").select("pathway_slug,audio_content_hash,timeline"),
    service.from("pathway_video_renders").select("pathway_slug,format,status,requested_at").order("requested_at", { ascending: false }),
    service.from("sol_operator_runs").select("recipe_key,pathway_slug,status").in("status", ["queued", "running", "retrying", "waiting_review"]),
    service.from("studio_content_calendar_items").select("content_type,status,published_at").eq("status", "published").gte("published_at", since),
    service.from("studio_creative_projects").select("id,pathway_slug,format,status").eq("format", "carousel").neq("status", "archived")
  ]);
  const failure = [profiles, publications, audio, scripts, projects, renders, runs, calendar, creatives].find((item) => item.error);
  if (failure?.error) throw failure.error;

  const profileMap = new Map((profiles.data ?? []).map((item) => [String(item.pathway_slug), item]));
  const audioMap = new Map((audio.data ?? []).map((item) => [String(item.pathway_slug), item]));
  const scriptMap = new Map((scripts.data ?? []).map((item) => [String(item.pathway_slug), item]));
  const projectMap = new Map((projects.data ?? []).map((item) => [String(item.pathway_slug), item]));
  const publicationsBySlug = new Map<string, typeof publications.data>();
  for (const item of publications.data ?? []) publicationsBySlug.set(String(item.pathway_slug), [...(publicationsBySlug.get(String(item.pathway_slug)) ?? []), item]);
  const creativesBySlug = new Map<string, typeof creatives.data>();
  for (const item of creatives.data ?? []) creativesBySlug.set(String(item.pathway_slug), [...(creativesBySlug.get(String(item.pathway_slug)) ?? []), item]);
  const latestYoutubeRender = new Map<string, { status: string }>();
  for (const item of renders.data ?? []) {
    const slug = String(item.pathway_slug);
    if (item.format === "youtube" && !latestYoutubeRender.has(slug)) latestYoutubeRender.set(slug, { status: String(item.status) });
  }
  const activeBySlug = new Map<string, SolRecipeKey[]>();
  for (const item of runs.data ?? []) {
    const slug = item.pathway_slug ? String(item.pathway_slug) : "";
    if (slug) activeBySlug.set(slug, [...(activeBySlug.get(slug) ?? []), String(item.recipe_key) as SolRecipeKey]);
  }

  const pathways = allPathways.map((pathway) => {
    const profile = profileMap.get(pathway.slug);
    const sourceAudio = audioMap.get(pathway.slug);
    const script = scriptMap.get(pathway.slug);
    const pathwayPublications = publicationsBySlug.get(pathway.slug) ?? [];
    const pathwayCreatives = creativesBySlug.get(pathway.slug) ?? [];
    const sourceCurrent = Boolean(script?.script_hash && script?.source_hash === pathwayNarrationHash(pathway));
    const scriptApproved = sourceCurrent && script?.status === "approved";
    const theologyPassed = Boolean(scriptApproved && script?.checker_status === "passed" && script?.checked_script_hash === script?.script_hash);
    const audioMatchesScript = Boolean(sourceAudio?.audio_url && sourceAudio?.content_hash && sourceAudio.content_hash === script?.script_hash);
    return {
      slug: pathway.slug,
      title: pathway.title,
      summary: pathway.summary,
      collection: pathway.collection,
      steps: pathway.steps,
      campaignStatus: profile?.campaign_status ? String(profile.campaign_status) : null,
      primaryKeyword: profile?.primary_keyword ? String(profile.primary_keyword) : null,
      destinationUrl: profile?.app_url ? String(profile.app_url) : appDestination(pathway.slug, pathway.appSlug),
      automationLinked: Boolean(profile?.social_automation_id),
      audioReady: Boolean(sourceAudio?.audio_url && scriptApproved && theologyPassed && audioMatchesScript),
      scriptApproved,
      theologyPassed,
      audioMatchesScript,
      videoProjectReady: Array.isArray(projectMap.get(pathway.slug)?.timeline) && (projectMap.get(pathway.slug)?.timeline as unknown[]).length > 0,
      youtubeRenderState: latestYoutubeRender.get(pathway.slug)?.status ?? null,
      youtubePublished: pathwayPublications.some((item) => String(item.platform).toLowerCase() === "youtube" && item.status === "published"),
      carouselAssets: pathwayCreatives.length,
      carouselPublished: pathwayCreatives.filter((item) => item.status === "published").length,
      activeRecipes: activeBySlug.get(pathway.slug) ?? []
    };
  });

  const weeklyActuals = { youtube: 0, carousel: 0, short_video: 0, post: 0 };
  for (const item of calendar.data ?? []) {
    const key = String(item.content_type);
    if (key === "video") weeklyActuals.youtube += 1;
    else if (key === "carousel") weeklyActuals.carousel += 1;
    else if (key === "reel") weeklyActuals.short_video += 1;
    else if (key === "post" || key === "thread") weeklyActuals.post += 1;
  }
  return buildSolOperatorAnalysis({ pathways, weeklyTargets, weeklyActuals });
}

async function listProposals(service: Service) {
  const result = await service.from("sol_operator_proposals").select("*").order("updated_at", { ascending: false }).limit(40);
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => proposalFromRow(row as Record<string, unknown>));
}

async function listRuns(service: Service) {
  const result = await service.from("sol_operator_runs")
    .select("*")
    .in("status", CURRENT_RUN_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => runFromRow(row as Record<string, unknown>));
}

export async function scanSolOperator(actorUserId?: string | null) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const supersededReviewRuns = await reconcileDuplicateReviewRuns(service);
  const settings = await getSettings(service);
  const analysis = await observe(service, settings.weeklyTargets);
  const existingResult = await service.from("sol_operator_proposals").select("id,proposal_key,status").in("status", ["pending", "approved", "running"]);
  if (existingResult.error) throw existingResult.error;
  const existing = new Map((existingResult.data ?? []).map((row) => [String(row.proposal_key), row]));
  const activeKeys = new Set(analysis.proposals.map((item) => item.proposalKey));

  for (const proposal of analysis.proposals) {
    const row = {
      proposal_key: proposal.proposalKey,
      recipe_key: proposal.recipeKey,
      title: proposal.title,
      summary: proposal.summary,
      priority: proposal.priority,
      risk: proposal.risk,
      pathway_slugs: proposal.pathwaySlugs,
      evidence: proposal.evidence,
      plan: proposal.plan,
      inputs: proposal.inputs,
      suggested_constraints: proposal.suggestedConstraints
    };
    const current = existing.get(proposal.proposalKey);
    if (current) {
      const updated = await service.from("sol_operator_proposals").update(row).eq("id", current.id);
      if (updated.error) throw updated.error;
    } else {
      const inserted = await service.from("sol_operator_proposals").insert(row);
      if (inserted.error) throw inserted.error;
    }
  }

  for (const row of existingResult.data ?? []) {
    if (row.status === "pending" && !activeKeys.has(String(row.proposal_key))) {
      await service.from("sol_operator_proposals").update({ status: "expired" }).eq("id", row.id);
    }
  }
  const scannedAt = new Date().toISOString();
  await service.from("sol_operator_settings").update({ last_scan_at: scannedAt }).eq("workspace_key", "apostolic-guide");
  if (actorUserId) await recordStudioAudit({ actorUserId, action: "sol.scan_completed", resourceType: "sol_operator", metadata: { proposal_count: analysis.proposals.length, superseded_review_runs: supersededReviewRuns, scanned_at: scannedAt } });
  return analysis;
}

export async function getSolOperatorSnapshot(): Promise<SolOperatorSnapshot> {
  const service = createServiceClient();
  if (!service) return { dbReady: false, aiReady: Boolean(process.env.OPENAI_API_KEY?.trim()), rendererReady: Boolean(process.env.VIDEO_STUDIO_GITHUB_TOKEN?.trim()), settings: DEFAULT_SETTINGS, proposals: [], runs: [], kpis: [], coverage: { pathways: allPathways.length, audioReady: 0, youtubePublished: 0, carouselPublished: 0, automationsLinked: 0 }, generatedAt: new Date().toISOString() };
  try {
    const settings = await getSettings(service);
    const [analysis, proposals, runs] = await Promise.all([observe(service, settings.weeklyTargets), listProposals(service), listRuns(service)]);
    return { dbReady: true, aiReady: Boolean(process.env.OPENAI_API_KEY?.trim()), rendererReady: Boolean(process.env.VIDEO_STUDIO_GITHUB_TOKEN?.trim()), settings, proposals, runs, kpis: analysis.kpis, coverage: analysis.coverage, generatedAt: new Date().toISOString() };
  } catch (error) {
    console.error("Sol Operator snapshot failed", error);
    return { dbReady: false, aiReady: Boolean(process.env.OPENAI_API_KEY?.trim()), rendererReady: false, settings: DEFAULT_SETTINGS, proposals: [], runs: [], kpis: [], coverage: { pathways: allPathways.length, audioReady: 0, youtubePublished: 0, carouselPublished: 0, automationsLinked: 0 }, generatedAt: new Date().toISOString() };
  }
}

export async function updateSolSettings(input: { enabled: boolean; mode: SolMode; weeklyTargets?: Record<string, number> }, actorUserId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const targets = Object.fromEntries(Object.entries({ ...DEFAULT_TARGETS, ...input.weeklyTargets }).map(([key, value]) => [key, Math.max(0, Math.min(99, Math.round(Number(value) || 0)))]));
  const result = await service.from("sol_operator_settings").upsert({
    workspace_key: "apostolic-guide",
    enabled: input.enabled,
    mode: input.mode,
    weekly_targets: targets,
    allow_live_publishing: false,
    allow_automation_activation: false
  }, { onConflict: "workspace_key" });
  if (result.error) throw result.error;
  await recordStudioAudit({ actorUserId, action: "sol.settings_updated", resourceType: "sol_operator", metadata: { enabled: input.enabled, mode: input.mode, weekly_targets: targets } });
}

function runInputs(proposal: SolProposal, slug: string | null, constraints: string[]) {
  const base = { ...proposal.inputs, constraints, proposalTitle: proposal.title };
  if (!slug) return base;
  if (proposal.recipeKey === "audio_to_youtube") return { ...base, slug };
  if (proposal.recipeKey === "journey_automation_draft") {
    const items = Array.isArray(proposal.inputs.pathways) ? proposal.inputs.pathways as Array<Record<string, unknown>> : [];
    return { ...base, ...record(items.find((item) => item.slug === slug)), slug };
  }
  return { ...base, slug };
}

export async function approveSolProposal(proposalId: string, constraints: string[], actorUserId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const settings = await getSettings(service);
  if (!settings.enabled) throw new Error("Turn Sol on before approving work.");
  if (settings.mode === "watch") throw new Error("Switch Sol to Assist before approving work.");
  const result = await service.from("sol_operator_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Proposal not found.");
  const proposal = proposalFromRow(result.data as Record<string, unknown>);
  if (!["pending", "failed"].includes(proposal.status)) throw new Error("This proposal is no longer waiting for approval.");
  const now = new Date().toISOString();
  const approved = await service.from("sol_operator_proposals").update({ status: "approved", approved_by: actorUserId, approved_at: now, approval_constraints: constraints }).eq("id", proposal.id).in("status", ["pending", "failed"]);
  if (approved.error) throw approved.error;
  const slugs = proposal.recipeKey === "carousel_topic_pack" ? [proposal.pathwaySlugs[0] ?? null] : proposal.pathwaySlugs.length ? proposal.pathwaySlugs : [null];
  const rows = slugs.map((slug) => ({
    proposal_id: proposal.id,
    recipe_key: proposal.recipeKey,
    pathway_slug: slug,
    status: "queued",
    progress: 0,
    current_step: SOL_RECIPE_STEPS[proposal.recipeKey][0]?.key ?? null,
    inputs: runInputs(proposal, slug, constraints),
    steps: SOL_RECIPE_STEPS[proposal.recipeKey].map((step) => ({ ...step, status: "pending" })),
    requested_by: actorUserId
  }));
  const created = await service.from("sol_operator_runs").insert(rows).select("id");
  if (created.error) throw created.error;
  await service.from("sol_operator_proposals").update({ status: "running" }).eq("id", proposal.id);
  await recordStudioAudit({ actorUserId, action: "sol.proposal_approved", resourceType: "sol_proposal", resourceId: proposal.id, metadata: { recipe_key: proposal.recipeKey, pathway_slugs: proposal.pathwaySlugs, constraints, run_count: created.data?.length ?? 0 } });
  return { proposal, runIds: (created.data ?? []).map((item) => String(item.id)) };
}

export async function dismissSolProposal(proposalId: string, actorUserId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const result = await service.from("sol_operator_proposals").update({ status: "dismissed", dismissed_by: actorUserId, dismissed_at: new Date().toISOString() }).eq("id", proposalId).eq("status", "pending");
  if (result.error) throw result.error;
  await recordStudioAudit({ actorUserId, action: "sol.proposal_dismissed", resourceType: "sol_proposal", resourceId: proposalId });
}

export async function cancelSolRun(runId: string, actorUserId: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const result = await service.from("sol_operator_runs").update({ status: "cancelled", current_step: null, completed_at: new Date().toISOString() }).eq("id", runId).in("status", ["queued", "running", "retrying"]);
  if (result.error) throw result.error;
  await recordStudioAudit({ actorUserId, action: "sol.run_cancelled", resourceType: "sol_run", resourceId: runId });
}

export async function completeProposalFromRuns(proposalId: string) {
  const service = createServiceClient();
  if (!service) return;
  const runs = await service.from("sol_operator_runs").select("status").eq("proposal_id", proposalId);
  if (runs.error || !runs.data?.length) return;
  if (runs.data.some((item) => item.status === "queued" || item.status === "running" || item.status === "retrying")) return;
  const status = runs.data.every((item) => item.status === "failed" || item.status === "cancelled") ? "failed" : "completed";
  await service.from("sol_operator_proposals").update({ status }).eq("id", proposalId);
}

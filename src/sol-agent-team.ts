import "server-only";
import { getCreativeProductionSnapshot } from "./creative-project-server";
import { getPeopleMetrics } from "./people-crm";
import {
  dedupeSolCurrentRuns,
  solProposalCoveredByReviewRuns,
  solTeamRunIsActive
} from "./sol-agent-team-engine";
import { getSolManagerContentInventory } from "./sol-manager";
import { getSolOperatorSnapshot, scanSolOperator } from "./sol-operator";
import { createServiceClient } from "./supabase";

export type SolSpecialistAgentKey =
  | "content"
  | "production"
  | "distribution"
  | "guardian"
  | "relationships"
  | "strategy";

export type SolSpecialistAgentState = "working" | "watching" | "attention" | "blocked" | "idle";

export type SolSpecialistAgent = {
  key: SolSpecialistAgentKey;
  name: string;
  role: string;
  state: SolSpecialistAgentState;
  summary: string;
  nextAction: string;
  metrics: Array<{ label: string; value: number | string }>;
};

export type SolAgentTeamSnapshot = {
  generatedAt: string;
  intelligenceActive: true;
  executionEnabled: boolean;
  executionMode: "off" | "watch" | "assist" | "trusted";
  agents: SolSpecialistAgent[];
  priorities: Array<{ severity: "urgent" | "high" | "medium"; label: string; detail: string }>;
  hiddenHistoricalRuns: number;
};

async function journeyPulse() {
  const service = createServiceClient();
  if (!service) return { active: 0, overdue: 0, total: 0 };
  const result = await service
    .from("growth_journey_enrollments")
    .select("id,status,next_action_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (result.error) return { active: 0, overdue: 0, total: 0 };
  const now = Date.now();
  const rows = result.data ?? [];
  const live = rows.filter((row) => !["completed", "cancelled", "archived"].includes(String(row.status)));
  return {
    total: rows.length,
    active: live.length,
    overdue: live.filter((row) => row.next_action_at && Date.parse(String(row.next_action_at)) < now).length
  };
}

function priority(
  list: SolAgentTeamSnapshot["priorities"],
  severity: "urgent" | "high" | "medium",
  label: string,
  detail: string,
) {
  if (!list.some((item) => item.label === label && item.detail === detail)) list.push({ severity, label, detail });
}

export async function getSolAgentTeamSnapshot(): Promise<SolAgentTeamSnapshot> {
  const [inventory, creative, operator, people, journeys] = await Promise.all([
    getSolManagerContentInventory(),
    getCreativeProductionSnapshot(),
    getSolOperatorSnapshot(),
    getPeopleMetrics(),
    journeyPulse()
  ]);

  const visibleRuns = dedupeSolCurrentRuns(operator.runs);
  const active = visibleRuns.filter((run) => solTeamRunIsActive(run.status));
  const waitingReview = visibleRuns.filter((run) => run.status === "waiting_review");
  const failed = visibleRuns.filter((run) => run.status === "failed" || run.status === "stalled");
  const pending = operator.proposals.filter((proposal) => proposal.status === "pending");
  const kpisBehind = operator.kpis.filter((kpi) => kpi.actual < kpi.target);
  const audioGaps = inventory.totals.audio.missing + inventory.totals.audio.stale + inventory.totals.audio.blocked;
  const readyUnscheduled = creative.unscheduledReady.length;
  const publishFailures = creative.recentFailed.length;
  const priorities: SolAgentTeamSnapshot["priorities"] = [];

  if (failed.length) priority(priorities, "urgent", "Recover failed work", `${failed.length} current run${failed.length === 1 ? " is" : "s are"} failed or stalled.`);
  if (publishFailures) priority(priorities, "urgent", "Fix publication failures", `${publishFailures} recent publication attempt${publishFailures === 1 ? " needs" : "s need"} recovery.`);
  if (waitingReview.length) priority(priorities, "high", "Clear review gates", `${waitingReview.length} current job${waitingReview.length === 1 ? " is" : "s are"} waiting for review.`);
  if (audioGaps) priority(priorities, "high", "Close the audio backlog", `${inventory.totals.audio.ready}/${inventory.totals.audio.desired} Pathway audios are current.`);
  if (readyUnscheduled) priority(priorities, "high", "Move ready creative", `${readyUnscheduled} Creative Project${readyUnscheduled === 1 ? " is" : "s are"} ready but not scheduled.`);
  if (journeys.overdue) priority(priorities, "high", "Review overdue journey actions", `${journeys.overdue} stored journey action${journeys.overdue === 1 ? " is" : "s are"} overdue.`);
  if (kpisBehind.length) priority(priorities, "medium", "Catch weekly content pace", `${kpisBehind.length} weekly KPI${kpisBehind.length === 1 ? " is" : "s are"} behind target.`);
  if (pending.length) priority(priorities, "medium", "Move staged proposals", `${pending.length} evidence-backed proposal${pending.length === 1 ? " is" : "s are"} waiting.`);

  const agents: SolSpecialistAgent[] = [
    {
      key: "content",
      name: "Atlas",
      role: "Content intelligence",
      state: audioGaps || inventory.totals.carousel.missing ? "attention" : "watching",
      summary: `${inventory.totals.audio.ready}/${inventory.totals.audio.desired} audios current · ${inventory.totals.carousel.published} Pathways with published carousels.`,
      nextAction: audioGaps ? "Identify the next source-aligned content gaps and feed them to Production." : "Keep canonical Pathway coverage current.",
      metrics: [
        { label: "Audio ready", value: inventory.totals.audio.ready },
        { label: "Audio stale", value: inventory.totals.audio.stale },
        { label: "Audio blocked", value: inventory.totals.audio.blocked },
        { label: "Carousel missing", value: inventory.totals.carousel.missing }
      ]
    },
    {
      key: "production",
      name: "Forge",
      role: "Production operator",
      state: active.length ? "working" : pending.length ? "attention" : "watching",
      summary: `${active.length} current job${active.length === 1 ? "" : "s"} moving · ${pending.length} proposal${pending.length === 1 ? "" : "s"} waiting.`,
      nextAction: active.length ? "Finish current registered jobs and verify outputs." : pending.length ? "Stage the highest-value safe proposal." : "Wait for the next evidence-backed production gap.",
      metrics: [
        { label: "Moving", value: active.length },
        { label: "Proposals", value: pending.length },
        { label: "Review", value: waitingReview.length },
        { label: "Failed", value: failed.length }
      ]
    },
    {
      key: "distribution",
      name: "Relay",
      role: "Publishing readiness",
      state: publishFailures ? "blocked" : readyUnscheduled ? "attention" : creative.scheduled.length ? "working" : "watching",
      summary: `${readyUnscheduled} ready unscheduled · ${creative.scheduled.length} scheduled/publishing · ${publishFailures} failed.`,
      nextAction: publishFailures ? "Recover failed publication attempts before adding more external work." : readyUnscheduled ? "Build the next publishing plan without crossing the live-publish gate." : "Watch channel readiness and publication state.",
      metrics: [
        { label: "Ready", value: readyUnscheduled },
        { label: "Scheduled", value: creative.scheduled.length },
        { label: "Failed", value: publishFailures }
      ]
    },
    {
      key: "guardian",
      name: "Sentinel",
      role: "Doctrine + system health",
      state: !operator.dbReady || !operator.aiReady ? "blocked" : failed.length || inventory.totals.audio.stale || inventory.totals.audio.blocked ? "attention" : "watching",
      summary: `DB ${operator.dbReady ? "ready" : "down"} · AI ${operator.aiReady ? "ready" : "missing"} · renderer ${operator.rendererReady ? "ready" : "limited"}.`,
      nextAction: failed.length ? "Prioritize failed/stalled jobs and preserve review gates." : inventory.totals.audio.stale || inventory.totals.audio.blocked ? "Keep stale or unapproved content from being counted as done." : "Continue policy and source-integrity checks.",
      metrics: [
        { label: "Stale audio", value: inventory.totals.audio.stale },
        { label: "Blocked audio", value: inventory.totals.audio.blocked },
        { label: "Run failures", value: failed.length }
      ]
    },
    {
      key: "relationships",
      name: "Shepherd",
      role: "People + journey intelligence",
      state: journeys.overdue ? "attention" : journeys.active ? "working" : "watching",
      summary: `${people.active7d} people active in 7d · ${journeys.active} active stored journey${journeys.active === 1 ? "" : "s"}.`,
      nextAction: journeys.overdue ? "Surface overdue recorded next actions without inventing spiritual conclusions." : "Watch real journey evidence and interaction history.",
      metrics: [
        { label: "People", value: people.total },
        { label: "Active 7d", value: people.active7d },
        { label: "Journeys", value: journeys.active },
        { label: "Overdue", value: journeys.overdue }
      ]
    },
    {
      key: "strategy",
      name: "Compass",
      role: "Priority + KPI intelligence",
      state: kpisBehind.length || priorities.length ? "attention" : "watching",
      summary: `${kpisBehind.length} KPI${kpisBehind.length === 1 ? "" : "s"} behind · ${priorities.length} manager priorit${priorities.length === 1 ? "y" : "ies"}.`,
      nextAction: priorities.length ? `Push first: ${priorities[0].label}.` : "Keep the work graph aligned to current goals.",
      metrics: [
        { label: "KPIs behind", value: kpisBehind.length },
        { label: "Priorities", value: priorities.length },
        { label: "YouTube", value: `${inventory.totals.youtube.published}/${inventory.totals.youtube.desired}` }
      ]
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    intelligenceActive: true,
    executionEnabled: operator.settings.enabled,
    executionMode: operator.settings.enabled ? operator.settings.mode : "off",
    agents,
    priorities: priorities.slice(0, 8),
    hiddenHistoricalRuns: Math.max(0, operator.runs.length - visibleRuns.length)
  };
}

export async function suppressDuplicateReviewWork() {
  const service = createServiceClient();
  if (!service) return 0;
  const [runs, proposals] = await Promise.all([
    service.from("sol_operator_runs")
      .select("recipe_key,pathway_slug,status")
      .eq("status", "waiting_review"),
    service.from("sol_operator_proposals")
      .select("id,recipe_key,pathway_slugs,status")
      .eq("status", "pending")
  ]);
  if (runs.error || proposals.error) return 0;

  const reviewRuns = (runs.data ?? []).map((run) => ({
    recipeKey: String(run.recipe_key),
    pathwaySlug: run.pathway_slug ? String(run.pathway_slug) : null,
    status: String(run.status)
  }));
  let expired = 0;
  for (const proposal of proposals.data ?? []) {
    const normalized = {
      recipeKey: String(proposal.recipe_key),
      pathwaySlugs: Array.isArray(proposal.pathway_slugs) ? proposal.pathway_slugs.map(String) : []
    };
    if (!solProposalCoveredByReviewRuns(normalized, reviewRuns)) continue;
    const result = await service.from("sol_operator_proposals").update({ status: "expired" }).eq("id", proposal.id).eq("status", "pending");
    if (!result.error) expired += 1;
  }
  return expired;
}

export async function runSolManagerCycle(actorUserId?: string | null) {
  // Observation is always live. Power and mode gate mutation/execution, not intelligence.
  await scanSolOperator(actorUserId ?? undefined);
  const suppressed = await suppressDuplicateReviewWork();
  const team = await getSolAgentTeamSnapshot();
  return { team, suppressedDuplicateProposals: suppressed };
}

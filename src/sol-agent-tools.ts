import "server-only";
import type { SolAdminSurface } from "./sol-admin-context";
import { getCreativeProductionSnapshot } from "./creative-project-server";
import { createSolAgentApproval, type SolAgentApproval } from "./sol-agent-memory";
import { hasExplicitSolIntent } from "./sol-agent-policy";
import { getSolAgentTeamSnapshot, runSolManagerCycle } from "./sol-agent-team";
import { dedupeSolCurrentRuns } from "./sol-agent-team-engine";
import { getSolManagerContentInventory, getSolManagerPeopleStatus } from "./sol-manager";
import type { SolManagerContentKind } from "./sol-manager-engine";
import { cancelSolRunV3, retrySolRun } from "./sol-run-recovery";
import { isTrustedAutoRunnableProposal } from "./sol-trusted-policy";
import {
  approveSolProposal,
  dismissSolProposal,
  getSolOperatorSnapshot,
  updateSolSettings,
  type SolOperatorSnapshot,
  type SolProposal
} from "./sol-operator";
import type { SolMode } from "./sol-operator-engine";

export type SolAgentToolName =
  | "get_workspace_status"
  | "get_current_screen"
  | "get_content_inventory"
  | "get_people_journey_status"
  | "list_creative_projects"
  | "scan_workspace"
  | "list_proposals"
  | "list_runs"
  | "set_mode"
  | "run_proposal"
  | "dismiss_proposal"
  | "cancel_run"
  | "retry_run";

export type SolAgentToolResult = {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
  runIds?: string[];
  approval?: SolAgentApproval;
};

type ToolContext = {
  actorUserId: string;
  threadId: string;
  userMessage: string;
  surface: SolAdminSurface;
  snapshot: SolOperatorSnapshot;
};

const EMPTY_OBJECT = { type: "object", additionalProperties: false, properties: {}, required: [] } as const;

export const SOL_AGENT_TOOLS = [
  {
    type: "function",
    name: "get_workspace_status",
    description: "Read the reconciled Apostolic Guide Manager state: specialist-agent status, priorities, KPIs, content coverage, Creative Project production state, current execution, failures, and review gates. Use this before making claims about what needs attention.",
    strict: true,
    parameters: EMPTY_OBJECT
  },
  {
    type: "function",
    name: "get_current_screen",
    description: "Read trusted server-authored context for the admin screen the user is currently viewing.",
    strict: true,
    parameters: EMPTY_OBJECT
  },
  {
    type: "function",
    name: "get_content_inventory",
    description: "Read deterministic Pathway production inventory and exact counts for audio, video/YouTube, carousels, and linked automations. Audio is only counted ready when its script is current, approved, doctrine-passed, and hash-aligned.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["asset_type", "pathway_slug"],
      properties: {
        asset_type: { type: "string", enum: ["all", "audio", "video", "youtube", "carousel", "automation"] },
        pathway_slug: { type: "string", description: "Canonical Pathway slug, or an empty string for all Pathways." }
      }
    }
  },
  {
    type: "function",
    name: "get_people_journey_status",
    description: "Read CRM people and stored growth-journey progress. Use this before claiming where a person is in a journey. Never infer spiritual state from comments or prose; report stored journey evidence only.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["person_id", "query", "limit"],
      properties: {
        person_id: { type: "string", description: "Exact person ID, or an empty string to search/list people." },
        query: { type: "string", description: "Name, email, handle, or other people search text, or an empty string." },
        limit: { type: "integer", minimum: 1, maximum: 10 }
      }
    }
  },
  {
    type: "function",
    name: "list_creative_projects",
    description: "Read persistent Creative Project production state, including Draft/Ready/Scheduled/Published counts, ready projects that are not scheduled, and failed publication attempts.",
    strict: true,
    parameters: EMPTY_OBJECT
  },
  {
    type: "function",
    name: "scan_workspace",
    description: "Run the reconciled manager cycle. It inspects current state, discovers evidence-backed proposals when execution is enabled, suppresses duplicate work already at review, and refreshes specialist priorities. It never publishes content.",
    strict: true,
    parameters: EMPTY_OBJECT
  },
  {
    type: "function",
    name: "list_proposals",
    description: "List only current pending Sol proposals after reconciliation, with IDs, risk, pathways, and suggested constraints.",
    strict: true,
    parameters: EMPTY_OBJECT
  },
  {
    type: "function",
    name: "list_runs",
    description: "List only current live execution and real attention gates. Completed history and duplicate recipe/pathway runs are hidden from this operational view.",
    strict: true,
    parameters: EMPTY_OBJECT
  },
  {
    type: "function",
    name: "set_mode",
    description: "Change execution to Watch, Assist, or Trusted, or turn execution off. Intelligence remains active. Only use when the user's current message directly asks for this change.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["enabled", "mode"],
      properties: {
        enabled: { type: "boolean" },
        mode: { type: "string", enum: ["watch", "assist", "trusted"] }
      }
    }
  },
  {
    type: "function",
    name: "run_proposal",
    description: "Queue one supplied pending proposal through its registered recipe. In Assist this creates a human approval checkpoint. In Trusted only policy-allowlisted safe drafts may start automatically.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["proposal_id", "constraints"],
      properties: {
        proposal_id: { type: "string" },
        constraints: { type: "array", maxItems: 12, items: { type: "string" } }
      }
    }
  },
  {
    type: "function",
    name: "dismiss_proposal",
    description: "Dismiss one pending proposal. Only execute directly when the user's current message explicitly asks to dismiss it; otherwise request approval.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["proposal_id"],
      properties: { proposal_id: { type: "string" } }
    }
  },
  {
    type: "function",
    name: "cancel_run",
    description: "Cancel one queued, running, or retrying Sol run. Only execute directly when the user's current message explicitly asks to cancel or stop work; otherwise request approval.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["run_id"],
      properties: { run_id: { type: "string" } }
    }
  },
  {
    type: "function",
    name: "retry_run",
    description: "Retry one failed, stalled, or retrying Sol run. Only execute directly when the user's current message explicitly asks to retry or recover it; otherwise request approval.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["run_id"],
      properties: { run_id: { type: "string" } }
    }
  }
] as const;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12) : [];
}

function proposalSummary(proposal: SolProposal) {
  const scope = proposal.pathwaySlugs.length ? ` for ${proposal.pathwaySlugs.join(", ")}` : "";
  return `${proposal.title}${scope}. Risk: ${proposal.risk.replaceAll("_", " ")}.`;
}

async function requestApproval(context: ToolContext, input: {
  toolName: SolAgentToolName;
  toolArguments: Record<string, unknown>;
  summary: string;
  risk: SolAgentApproval["risk"];
}): Promise<SolAgentToolResult> {
  const approval = await createSolAgentApproval({
    threadId: context.threadId,
    requestedBy: context.actorUserId,
    toolName: input.toolName,
    toolArguments: input.toolArguments,
    summary: input.summary,
    risk: input.risk
  });
  return { ok: true, message: `Approval required: ${input.summary}`, approval, data: { approval_required: true } };
}

function currentStatus(snapshot: SolOperatorSnapshot) {
  const currentRuns = dedupeSolCurrentRuns(snapshot.runs);
  const pending = snapshot.proposals.filter((item) => item.status === "pending");
  const active = currentRuns.filter((item) => ["queued", "running", "retrying"].includes(item.status));
  const failed = currentRuns.filter((item) => item.status === "failed" || item.status === "stalled");
  const review = currentRuns.filter((item) => item.status === "waiting_review");
  const behind = snapshot.kpis.filter((item) => item.actual < item.target);
  return {
    executionEnabled: snapshot.settings.enabled,
    executionMode: snapshot.settings.enabled ? snapshot.settings.mode : "off",
    lastScanAt: snapshot.settings.lastScanAt,
    pendingProposals: pending.length,
    activeRuns: active.length,
    failedOrStalledRuns: failed.length,
    waitingReview: review.length,
    hiddenHistoricalRuns: Math.max(0, snapshot.runs.length - currentRuns.length),
    kpisBehind: behind.map((item) => ({ key: item.key, actual: item.actual, target: item.target })),
    coverage: snapshot.coverage,
    generatedAt: snapshot.generatedAt
  };
}

export async function executeSolAgentTool(name: SolAgentToolName, rawArgs: unknown, context: ToolContext): Promise<SolAgentToolResult> {
  const args = record(rawArgs);

  if (name === "get_workspace_status") {
    const [snapshot, creativeProduction, team] = await Promise.all([
      getSolOperatorSnapshot(),
      getCreativeProductionSnapshot(),
      getSolAgentTeamSnapshot()
    ]);
    return {
      ok: true,
      message: "Reconciled manager status loaded.",
      data: {
        ...currentStatus(snapshot),
        intelligenceActive: team.intelligenceActive,
        specialists: team.agents,
        managerPriorities: team.priorities,
        creativeProduction
      }
    };
  }

  if (name === "get_current_screen") {
    return { ok: true, message: `Current screen: ${context.surface.label}.`, data: { ...context.surface } };
  }

  if (name === "get_content_inventory") {
    const rawKind = String(args.asset_type || "all");
    const kind: SolManagerContentKind = ["all", "audio", "video", "youtube", "carousel", "automation"].includes(rawKind)
      ? rawKind as SolManagerContentKind
      : "all";
    const inventory = await getSolManagerContentInventory({ kind, pathwaySlug: String(args.pathway_slug || "") });
    return { ok: true, message: "Content inventory loaded.", data: inventory as unknown as Record<string, unknown> };
  }

  if (name === "get_people_journey_status") {
    const people = await getSolManagerPeopleStatus({
      personId: String(args.person_id || ""),
      query: String(args.query || ""),
      limit: Number(args.limit) || 10
    });
    return { ok: true, message: "People journey status loaded.", data: people as unknown as Record<string, unknown> };
  }

  if (name === "list_creative_projects") {
    return { ok: true, message: "Creative Project production state loaded.", data: await getCreativeProductionSnapshot() };
  }

  if (name === "scan_workspace") {
    const cycle = await runSolManagerCycle(context.actorUserId);
    const next = await getSolOperatorSnapshot();
    return {
      ok: true,
      message: `Manager cycle complete. ${next.proposals.filter((item) => item.status === "pending").length} current proposals are waiting.`,
      data: {
        ...currentStatus(next),
        managerPriorities: cycle.team.priorities,
        specialists: cycle.team.agents,
        duplicateProposalsSuppressed: cycle.suppressedDuplicateProposals
      }
    };
  }

  if (name === "list_proposals") {
    const next = await getSolOperatorSnapshot();
    return {
      ok: true,
      message: "Current proposals loaded.",
      data: {
        proposals: next.proposals.filter((item) => item.status === "pending").map((item) => ({
          id: item.id,
          title: item.title,
          summary: item.summary,
          recipeKey: item.recipeKey,
          risk: item.risk,
          priority: item.priority,
          pathwaySlugs: item.pathwaySlugs,
          suggestedConstraints: item.suggestedConstraints
        }))
      }
    };
  }

  if (name === "list_runs") {
    const next = await getSolOperatorSnapshot();
    const current = dedupeSolCurrentRuns(next.runs);
    return {
      ok: true,
      message: "Current execution loaded. Completed history is hidden.",
      data: {
        hiddenHistoricalRuns: Math.max(0, next.runs.length - current.length),
        runs: current.map((item) => ({
          id: item.id,
          recipeKey: item.recipeKey,
          pathwaySlug: item.pathwaySlug,
          status: item.status,
          progress: item.progress,
          currentStep: item.currentStep,
          error: item.error,
          updatedAt: item.updatedAt
        }))
      }
    };
  }

  if (name === "set_mode") {
    const mode = String(args.mode || "") as SolMode;
    const enabled = args.enabled === true;
    if (!["watch", "assist", "trusted"].includes(mode) || !hasExplicitSolIntent(context.userMessage, "mode")) {
      return { ok: false, message: "Execution mode changes require a direct request in the current user message." };
    }
    await updateSolSettings({ enabled, mode, weeklyTargets: context.snapshot.settings.weeklyTargets }, context.actorUserId);
    return { ok: true, message: enabled ? `Sol execution is now in ${mode} mode. Intelligence remains active.` : "Sol execution is paused. Intelligence remains active.", data: { enabled, mode } };
  }

  if (name === "run_proposal") {
    const proposalId = String(args.proposal_id || "");
    const freshSnapshot = await getSolOperatorSnapshot();
    const proposal = freshSnapshot.proposals.find((item) => item.id === proposalId && item.status === "pending");
    if (!proposal) return { ok: false, message: "That proposal is not current anymore. Reconcile before acting." };
    const constraints = stringArray(args.constraints);
    if (!freshSnapshot.settings.enabled) return { ok: false, message: "Execution is paused. Turn on Assist or Trusted before starting work." };
    if (freshSnapshot.settings.mode === "watch") return { ok: false, message: "Watch mode cannot run proposals. Switch execution to Assist or Trusted first." };
    if (freshSnapshot.settings.mode === "assist" || !isTrustedAutoRunnableProposal(proposal)) {
      return requestApproval(context, {
        toolName: name,
        toolArguments: { proposal_id: proposal.id, constraints },
        summary: `Run “${proposal.title}” through its registered gates. ${proposalSummary(proposal)}`,
        risk: proposal.risk
      });
    }
    const approved = await approveSolProposal(proposal.id, constraints.length ? constraints : proposal.suggestedConstraints, context.actorUserId);
    return { ok: true, message: `Queued ${approved.runIds.length} safe draft ${approved.runIds.length === 1 ? "run" : "runs"}.`, runIds: approved.runIds, data: { proposalId: proposal.id, trusted_auto: true } };
  }

  if (name === "dismiss_proposal") {
    const proposalId = String(args.proposal_id || "");
    const fresh = await getSolOperatorSnapshot();
    const proposal = fresh.proposals.find((item) => item.id === proposalId && item.status === "pending");
    if (!proposal) return { ok: false, message: "That proposal is not current anymore." };
    if (!hasExplicitSolIntent(context.userMessage, "dismiss")) {
      return requestApproval(context, { toolName: name, toolArguments: { proposal_id: proposal.id }, summary: `Dismiss “${proposal.title}”.`, risk: "review_required" });
    }
    await dismissSolProposal(proposal.id, context.actorUserId);
    return { ok: true, message: `Dismissed “${proposal.title}”.` };
  }

  if (name === "cancel_run") {
    const runId = String(args.run_id || "");
    const fresh = await getSolOperatorSnapshot();
    const run = fresh.runs.find((item) => item.id === runId);
    if (!run || !["queued", "running", "retrying"].includes(run.status)) return { ok: false, message: "That run is not active." };
    if (!hasExplicitSolIntent(context.userMessage, "cancel")) {
      return requestApproval(context, { toolName: name, toolArguments: { run_id: run.id }, summary: `Cancel the ${run.recipeKey.replaceAll("_", " ")} run${run.pathwaySlug ? ` for ${run.pathwaySlug}` : ""}.`, risk: "review_required" });
    }
    await cancelSolRunV3(run.id, context.actorUserId);
    return { ok: true, message: "Run cancelled." };
  }

  if (name === "retry_run") {
    const runId = String(args.run_id || "");
    const fresh = await getSolOperatorSnapshot();
    const run = fresh.runs.find((item) => item.id === runId);
    if (!run || !["failed", "stalled", "retrying"].includes(run.status)) return { ok: false, message: "That run is not retryable." };
    if (!hasExplicitSolIntent(context.userMessage, "retry")) {
      return requestApproval(context, { toolName: name, toolArguments: { run_id: run.id }, summary: `Retry the ${run.recipeKey.replaceAll("_", " ")} run${run.pathwaySlug ? ` for ${run.pathwaySlug}` : ""}.`, risk: "review_required" });
    }
    await retrySolRun(run.id, context.actorUserId);
    return { ok: true, message: "Run queued for retry.", runIds: [run.id] };
  }

  return { ok: false, message: `Tool ${name} is not registered.` };
}

export async function executeApprovedSolAgentTool(input: {
  approval: SolAgentApproval;
  actorUserId: string;
  threadId: string;
  surface: SolAdminSurface;
  snapshot: SolOperatorSnapshot;
}): Promise<SolAgentToolResult> {
  const args = input.approval.toolArguments;
  const name = input.approval.toolName as SolAgentToolName;

  if (name === "run_proposal") {
    const proposalId = String(args.proposal_id || "");
    const fresh = await getSolOperatorSnapshot();
    const proposal = fresh.proposals.find((item) => item.id === proposalId && item.status === "pending");
    if (!proposal) return { ok: false, message: "The proposal changed before approval. Nothing was started." };
    const approved = await approveSolProposal(proposal.id, stringArray(args.constraints), input.actorUserId);
    return { ok: true, message: `Approved and queued ${approved.runIds.length} ${approved.runIds.length === 1 ? "run" : "runs"}.`, runIds: approved.runIds };
  }

  if (name === "dismiss_proposal") {
    await dismissSolProposal(String(args.proposal_id || ""), input.actorUserId);
    return { ok: true, message: "Proposal dismissed." };
  }

  if (name === "cancel_run") {
    await cancelSolRunV3(String(args.run_id || ""), input.actorUserId);
    return { ok: true, message: "Run cancelled." };
  }

  if (name === "retry_run") {
    const runId = String(args.run_id || "");
    await retrySolRun(runId, input.actorUserId);
    return { ok: true, message: "Run queued for retry.", runIds: [runId] };
  }

  return { ok: false, message: "This approval no longer maps to a mutation tool." };
}

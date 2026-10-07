import { z } from "zod";
import { buildEditorialWindow, editorialDate } from "@/editorial-engine";
import { allPathways, pathwayBySlug } from "@/pathway-catalog";
import { dedupeSolCurrentRuns } from "@/sol-agent-team-engine";
import { getSolOperatorSnapshot, listRecentSolActivity } from "@/sol-operator";
import type { OperatorActionDefinition, OperatorActionResult } from "../types";

const emptyInput = z.object({}).strict();

function isServerOnlyGuard(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /Client Component/i.test(error.message) || /Cannot find module ['"]server-only['"]/i.test(error.message);
}

async function loadCreativeSnapshot() {
  try {
    const mod = await import("@/creative-project-server");
    return await mod.getCreativeProductionSnapshot();
  } catch (error) {
    if (isServerOnlyGuard(error)) return null;
    throw error;
  }
}

async function loadTeamSnapshot() {
  try {
    const mod = await import("@/sol-agent-team");
    return await mod.getSolAgentTeamSnapshot();
  } catch (error) {
    if (isServerOnlyGuard(error)) return null;
    throw error;
  }
}

const workspaceStatus: OperatorActionDefinition = {
  name: "workspace.status",
  description: "Read current Sol execution mode, specialist pressure, review gates, and KPI pace.",
  inputSchema: emptyInput,
  permission: "view_workspace",
  classification: "read",
  async handler() {
    const [snapshot, team] = await Promise.all([getSolOperatorSnapshot(), loadTeamSnapshot()]);
    const runs = dedupeSolCurrentRuns(snapshot.runs);
    const pending = snapshot.proposals.filter((proposal) => proposal.status === "pending");
    const active = runs.filter((run) => ["queued", "running", "retrying"].includes(run.status));
    const review = runs.filter((run) => run.status === "waiting_review");
    const failed = runs.filter((run) => run.status === "failed" || run.status === "stalled");
    const behind = snapshot.kpis.filter((kpi) => kpi.actual < kpi.target);
    const summary = snapshot.settings.enabled
      ? `Sol is in ${snapshot.settings.mode} mode. ${active.length} running, ${review.length} waiting review, ${pending.length} proposals, ${behind.length} KPIs behind.`
      : `Sol execution is paused. ${pending.length} proposals and ${failed.length} failed or stalled runs are visible. Intelligence remains readable.`;
    return {
      summary,
      data: {
        dbReady: snapshot.dbReady,
        executionEnabled: snapshot.settings.enabled,
        executionMode: snapshot.settings.enabled ? snapshot.settings.mode : "off",
        lastScanAt: snapshot.settings.lastScanAt,
        pendingProposals: pending.length,
        activeRuns: active.length,
        waitingReview: review.length,
        failedOrStalledRuns: failed.length,
        kpisBehind: behind.map((kpi) => ({ key: kpi.key, label: kpi.label, actual: kpi.actual, target: kpi.target })),
        coverage: snapshot.coverage,
        priorities: team?.priorities ?? [],
        agents: (team?.agents ?? []).map((agent) => ({
          key: agent.key,
          name: agent.name,
          role: agent.role,
          state: agent.state,
          nextAction: agent.nextAction
        })),
        generatedAt: snapshot.generatedAt
      }
    };
  }
};

const pathwayList: OperatorActionDefinition = {
  name: "pathway.list",
  description: "List canonical Pathways with collection, level, and step count.",
  inputSchema: emptyInput,
  permission: "view_content",
  classification: "read",
  async handler() {
    const pathways = allPathways.map((pathway) => ({
      slug: pathway.slug,
      title: pathway.title,
      collection: pathway.collection,
      level: pathway.level,
      estimatedMinutes: pathway.estimatedMinutes,
      stepCount: pathway.steps.length
    }));
    return { summary: `${pathways.length} canonical Pathways.`, data: { pathways } };
  }
};

const pathwayInspect: OperatorActionDefinition = {
  name: "pathway.inspect",
  description: "Read one canonical Pathway by slug or exact title.",
  inputSchema: z.object({ slug: z.string().trim().min(1).max(80) }).strict(),
  permission: "view_content",
  classification: "read",
  async handler(input) {
    const slug = String((input as { slug: string }).slug);
    const pathway = pathwayBySlug(slug);
    if (!pathway) throw new Error("No canonical Pathway matches that slug.");
    return {
      summary: `${pathway.title} · ${pathway.steps.length} steps · ${pathway.collection}.`,
      data: {
        slug: pathway.slug,
        title: pathway.title,
        summary: pathway.summary,
        collection: pathway.collection,
        level: pathway.level,
        estimatedMinutes: pathway.estimatedMinutes,
        steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference }))
      }
    };
  }
};

const proposalsList: OperatorActionDefinition = {
  name: "sol.proposals.list",
  description: "List current pending Sol proposals without private run inputs.",
  inputSchema: emptyInput,
  permission: "view_workspace",
  classification: "read",
  async handler() {
    const snapshot = await getSolOperatorSnapshot();
    const proposals = snapshot.proposals
      .filter((proposal) => proposal.status === "pending")
      .map((proposal) => ({
        id: proposal.id,
        title: proposal.title,
        summary: proposal.summary,
        status: proposal.status,
        priority: proposal.priority,
        risk: proposal.risk,
        recipeKey: proposal.recipeKey,
        pathwaySlugs: proposal.pathwaySlugs
      }));
    return {
      summary: proposals.length ? `${proposals.length} proposals are waiting.` : "Sol has no pending proposals.",
      data: { dbReady: snapshot.dbReady, proposals }
    };
  }
};

const runsList: OperatorActionDefinition = {
  name: "sol.runs.list",
  description: "List current Sol runs and recent activity without stored inputs.",
  inputSchema: emptyInput,
  permission: "view_workspace",
  classification: "read",
  async handler() {
    const [snapshot, recent] = await Promise.all([getSolOperatorSnapshot(), listRecentSolActivity()]);
    const current = dedupeSolCurrentRuns(snapshot.runs).map((run) => ({
      id: run.id,
      recipeKey: run.recipeKey,
      pathwaySlug: run.pathwaySlug,
      status: run.status,
      progress: run.progress,
      currentStep: run.currentStep,
      error: run.error ? run.error.slice(0, 180) : null,
      updatedAt: run.updatedAt
    }));
    return {
      summary: `${current.length} current runs. ${recent.filter((run) => run.status === "completed").length} recent completed runs.`,
      data: { dbReady: snapshot.dbReady, runs: current, recent }
    };
  }
};

const creativeProjects: OperatorActionDefinition = {
  name: "creative.projects.list",
  description: "Read recent private Creative Projects and production counts.",
  inputSchema: emptyInput,
  permission: "view_content",
  classification: "read",
  async handler() {
    const snapshot = await loadCreativeSnapshot();
    if (!snapshot) {
      return { summary: "Creative projects are unavailable in this runtime.", data: { configured: false, projects: [] } };
    }
    const projects = snapshot.recentProjects.slice(0, 12).map((project) => ({
      id: project.id,
      title: project.title,
      pathwaySlug: project.pathwaySlug,
      format: project.format,
      status: project.status,
      updatedAt: project.updatedAt
    }));
    return {
      summary: snapshot.configured ? `${projects.length} recent Creative Projects.` : "Creative Project storage is not configured.",
      data: { configured: snapshot.configured, counts: snapshot.counts, projects }
    };
  }
};

const contentPlanPreview: OperatorActionDefinition = {
  name: "content.plan.preview",
  description: "Preview the canonical editorial window without saving or publishing it.",
  inputSchema: z.object({ days: z.number().int().min(1).max(14).default(14) }).strict(),
  permission: "view_content",
  classification: "read",
  async handler(input) {
    const days = Number((input as { days?: number }).days ?? 14);
    const packs = buildEditorialWindow(editorialDate(), days).map((pack) => ({
      date: pack.date,
      lane: pack.lane,
      pathwaySlug: pack.pathwaySlug,
      pathwayTitle: pack.pathwayTitle,
      title: pack.title,
      format: pack.format,
      frameCount: pack.frames.length,
      blockerCount: pack.blockers.length
    }));
    const result: OperatorActionResult = {
      summary: `Previewed ${packs.length} editorial days from the canonical planner. Nothing was saved or published.`,
      data: { days: packs.length, saved: false, published: false, packs }
    };
    return result;
  }
};

const feedPreview: OperatorActionDefinition = {
  name: "feed.preview",
  description: "Read the private scheduled Creative Project queue. This does not call Instagram.",
  inputSchema: emptyInput,
  permission: "view_distribution",
  classification: "read",
  async handler() {
    const snapshot = await loadCreativeSnapshot();
    if (!snapshot) {
      return { summary: "Feed preview is unavailable in this runtime.", data: { configured: false, externalPublish: false, scheduled: [] } };
    }
    return {
      summary: snapshot.configured
        ? `${snapshot.scheduled.length} items are in the private scheduled queue. Nothing was published.`
        : "Feed preview is unavailable until Studio storage is configured.",
      data: {
        configured: snapshot.configured,
        externalPublish: false,
        counts: snapshot.counts,
        scheduled: snapshot.scheduled,
        readyUnscheduled: snapshot.unscheduledReady.slice(0, 8)
      }
    };
  }
};

export const readActions: OperatorActionDefinition[] = [
  workspaceStatus,
  pathwayList,
  pathwayInspect,
  proposalsList,
  runsList,
  creativeProjects,
  contentPlanPreview,
  feedPreview
];

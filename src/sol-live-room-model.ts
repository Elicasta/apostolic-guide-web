export type SolLiveRun = {
  id: string;
  recipeKey: string;
  pathwaySlug: string | null;
  status: string;
  progress: number;
  currentStep: string | null;
  error: string | null;
  updatedAt: string;
};

export type SolLivePayload = {
  generatedAt: string;
  dbReady: boolean;
  settings: {
    enabled: boolean;
    mode: "watch" | "assist" | "trusted";
    lastScanAt: string | null;
  };
  agents: Array<{ key: string; name: string; role: string; state: string; summary: string; nextAction: string }>;
  priorities: Array<{ severity: string; label: string; detail: string }>;
  proposals: Array<{ id: string; title: string; summary: string; status: string; priority: string; risk: string; pathwaySlugs: string[]; updatedAt: string }>;
  runs: SolLiveRun[];
  recentActivity: SolLiveRun[];
  kpis: Array<{ key: string; label: string; actual: number; target: number }>;
  coverage: { pathways: number; audioReady: number; youtubePublished: number; carouselPublished: number; automationsLinked: number };
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function modeOf(value: unknown): SolLivePayload["settings"]["mode"] {
  return value === "assist" || value === "trusted" || value === "watch" ? value : "watch";
}

function runOf(value: unknown): SolLiveRun | null {
  const row = asRecord(value);
  if (!text(row.id)) return null;
  return {
    id: text(row.id),
    recipeKey: text(row.recipeKey),
    pathwaySlug: text(row.pathwaySlug) || null,
    status: text(row.status, "unknown"),
    progress: Number(row.progress) || 0,
    currentStep: text(row.currentStep) || null,
    error: text(row.error) || null,
    updatedAt: text(row.updatedAt)
  };
}

export function solLivePayloadFromApi(value: unknown): SolLivePayload | null {
  const row = asRecord(value);
  const settings = asRecord(row.settings);
  const coverage = asRecord(row.coverage);
  const team = asRecord(row.team);
  if (!text(row.generatedAt) && !text(team.generatedAt)) return null;
  const proposals = Array.isArray(row.proposals) ? row.proposals : [];
  const runs = Array.isArray(row.runs) ? row.runs : [];
  const recent = Array.isArray(row.recentActivity) ? row.recentActivity : [];
  const kpis = Array.isArray(row.kpis) ? row.kpis : [];
  const agents = Array.isArray(team.agents) ? team.agents : [];
  const priorities = Array.isArray(team.priorities) ? team.priorities : [];
  return {
    generatedAt: text(row.generatedAt) || text(team.generatedAt),
    dbReady: row.dbReady === true,
    settings: {
      enabled: settings.enabled === true,
      mode: modeOf(settings.mode),
      lastScanAt: text(settings.lastScanAt) || null
    },
    agents: agents.map((agent) => {
      const item = asRecord(agent);
      return {
        key: text(item.key),
        name: text(item.name),
        role: text(item.role),
        state: text(item.state, "watching"),
        summary: text(item.summary),
        nextAction: text(item.nextAction)
      };
    }),
    priorities: priorities.map((item) => {
      const priority = asRecord(item);
      return { severity: text(priority.severity, "medium"), label: text(priority.label), detail: text(priority.detail) };
    }),
    proposals: proposals.flatMap((item) => {
      const proposal = asRecord(item);
      if (!text(proposal.id)) return [];
      return [{
        id: text(proposal.id),
        title: text(proposal.title),
        summary: text(proposal.summary),
        status: text(proposal.status),
        priority: text(proposal.priority),
        risk: text(proposal.risk),
        pathwaySlugs: Array.isArray(proposal.pathwaySlugs) ? proposal.pathwaySlugs.map(String) : [],
        updatedAt: text(proposal.updatedAt)
      }];
    }),
    runs: runs.flatMap((item) => {
      const run = runOf(item);
      return run ? [run] : [];
    }),
    recentActivity: recent.flatMap((item) => {
      const run = runOf(item);
      return run ? [run] : [];
    }),
    kpis: kpis.flatMap((item) => {
      const kpi = asRecord(item);
      if (!text(kpi.key)) return [];
      return [{ key: text(kpi.key), label: text(kpi.label, text(kpi.key)), actual: Number(kpi.actual) || 0, target: Number(kpi.target) || 0 }];
    }),
    coverage: {
      pathways: Number(coverage.pathways) || 0,
      audioReady: Number(coverage.audioReady) || 0,
      youtubePublished: Number(coverage.youtubePublished) || 0,
      carouselPublished: Number(coverage.carouselPublished) || 0,
      automationsLinked: Number(coverage.automationsLinked) || 0
    }
  };
}

export function solLiveAttentionCount(payload: SolLivePayload) {
  const review = payload.runs.filter((run) => run.status === "waiting_review").length;
  const failed = payload.runs.filter((run) => run.status === "failed" || run.status === "stalled").length;
  const pending = payload.proposals.filter((proposal) => proposal.status === "pending").length;
  return { review, failed, pending, total: review + failed + pending };
}

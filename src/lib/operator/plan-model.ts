import { buildEditorialWindow, editorialDate } from "@/editorial-engine";

export const PLAN_SLOT_STATUSES = ["idea", "draft", "prepared", "ready-for-review", "blocked"] as const;
export const PLAN_PROPOSAL_KINDS = ["carousel", "article", "automation", "topic"] as const;
export type PlanSlotStatus = (typeof PLAN_SLOT_STATUSES)[number];
export type PlanProposalKind = (typeof PLAN_PROPOSAL_KINDS)[number];

export type PlanSlot = {
  id: string;
  position: number;
  slotDate: string;
  title: string;
  pathwaySlug: string | null;
  goal: string;
  reason: string;
  suggestedTopic: string;
  whyNow: string;
  nextSteps: string;
  dependencies: string[];
  status: PlanSlotStatus;
  proposalKind: PlanProposalKind;
};

export type PlanRevisionNote = {
  revision: number;
  reason: string;
  createdAt: string;
  changes: string[];
};

export type PrivatePlan = {
  id: string;
  ownerUserId: string;
  sessionId: string | null;
  title: string;
  timezone: string;
  startsOn: string;
  revision: number;
  slots: PlanSlot[];
  revisions: PlanRevisionNote[];
  createdAt: string;
  updatedAt: string;
};

export type PlanProposalSeed = {
  title: string;
  summary: string;
  pathwaySlugs: string[];
  recipeKey?: string | null;
};

const SLOT_FIELDS = ["title", "status", "pathwaySlug", "goal", "reason", "suggestedTopic", "whyNow", "nextSteps", "proposalKind", "position", "slotDate"] as const;

export function slotChanges(before: PlanSlot[], after: PlanSlot[]) {
  const prior = new Map(before.map((slot) => [slot.id, slot]));
  const changes: string[] = [];
  for (const slot of after) {
    const previous = prior.get(slot.id);
    if (!previous) {
      changes.push(`Added ${slot.slotDate}: ${slot.title}`);
      continue;
    }
    for (const field of SLOT_FIELDS) {
      if (String(previous[field] ?? "") !== String(slot[field] ?? "")) {
        changes.push(`${slot.slotDate} ${field}: ${String(previous[field] ?? "")} → ${String(slot[field] ?? "")}`);
      }
    }
    if (previous.dependencies.join("|") !== slot.dependencies.join("|")) changes.push(`${slot.slotDate} dependencies changed`);
  }
  return changes.slice(0, 40);
}

export function clonePlan(plan: PrivatePlan): PrivatePlan {
  return {
    ...plan,
    slots: plan.slots.map((slot) => ({ ...slot, dependencies: [...slot.dependencies] })),
    revisions: plan.revisions.map((revision) => ({ ...revision, changes: [...revision.changes] }))
  };
}

export function planPayload(plan: PrivatePlan) {
  const saved = clonePlan(plan);
  return {
    planId: saved.id,
    revision: saved.revision,
    saved: true as const,
    published: false as const,
    suggestionOnly: false as const,
    scheduled: false as const,
    plan: {
      id: saved.id,
      title: saved.title,
      timezone: saved.timezone,
      startsOn: saved.startsOn,
      revision: saved.revision,
      sessionId: saved.sessionId,
      slots: saved.slots,
      revisions: saved.revisions.slice(-12),
      updatedAt: saved.updatedAt
    }
  };
}

function proposalKind(recipeKey: string | null | undefined, format: "single" | "carousel"): PlanProposalKind {
  if (recipeKey === "carousel") return "carousel";
  if (recipeKey === "automation") return "automation";
  if (recipeKey === "article" || recipeKey === "post") return "article";
  return format === "carousel" ? "carousel" : "article";
}

export function buildPrivatePlanSlots(input: {
  start?: string;
  days: number;
  proposals?: PlanProposalSeed[];
  id: () => string;
}) {
  const start = input.start || editorialDate();
  const packs = buildEditorialWindow(start, input.days);
  return packs.map((pack, position) => {
    const related = (input.proposals ?? []).filter((proposal) => proposal.pathwaySlugs.includes(pack.pathwaySlug));
    const proposal = related[0];
    const blockers = pack.blockers.slice(0, 8);
    return {
      id: input.id(),
      position,
      slotDate: pack.date,
      title: pack.title.slice(0, 180),
      pathwaySlug: pack.pathwaySlug,
      goal: `${pack.lane} · ${pack.format}`,
      reason: `Canonical editorial window for ${pack.pathwayTitle}.`,
      suggestedTopic: (proposal?.title || pack.title).slice(0, 180),
      whyNow: (proposal?.summary || (blockers[0] ? `Blocker: ${blockers[0]}` : `Private ${pack.lane} lane for ${pack.date}.`)).slice(0, 500),
      nextSteps: "Private draft only. Edit or block this slot. Nothing is published or scheduled.",
      dependencies: blockers,
      status: (blockers.length ? "blocked" : "idea") as PlanSlotStatus,
      proposalKind: proposalKind(proposal?.recipeKey, pack.format)
    } satisfies PlanSlot;
  });
}

export function reorderPlanSlots(slots: PlanSlot[], orderedIds: string[]) {
  if (orderedIds.length !== slots.length || new Set(orderedIds).size !== slots.length) {
    throw new Error("Reorder must include every slot once.");
  }
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  for (const id of orderedIds) {
    if (!byId.has(id)) throw new Error("Reorder included a slot that is not on this plan.");
  }
  const dates = [...slots].sort((left, right) => left.position - right.position).map((slot) => slot.slotDate);
  return orderedIds.map((id, position) => ({ ...byId.get(id)!, position, slotDate: dates[position]! }));
}

export function applyPlanWrite(plan: PrivatePlan, input: {
  expectedRevision: number;
  reason: string;
  title?: string;
  timezone?: string;
  slots?: PlanSlot[];
  now: string;
}) {
  if (plan.revision !== input.expectedRevision) {
    return { ok: false as const, conflict: true as const, currentRevision: plan.revision, planId: plan.id };
  }
  const nextSlots = input.slots ?? plan.slots;
  const changes = slotChanges(plan.slots, nextSlots);
  if (input.title && input.title !== plan.title) changes.unshift(`Title: ${plan.title} → ${input.title}`);
  const revision = plan.revision + 1;
  const next: PrivatePlan = {
    ...plan,
    title: input.title ?? plan.title,
    timezone: input.timezone ?? plan.timezone,
    revision,
    slots: nextSlots.map((slot) => ({ ...slot, dependencies: [...slot.dependencies] })),
    revisions: [...plan.revisions, { revision, reason: input.reason, createdAt: input.now, changes }].slice(-20),
    updatedAt: input.now
  };
  return { ok: true as const, plan: next };
}

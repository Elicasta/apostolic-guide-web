import { randomUUID } from "node:crypto";
import { z } from "zod";
import { editorialDate } from "@/editorial-engine";
import { getSolOperatorSnapshot } from "@/sol-operator";
import { applyPlanWrite, buildPrivatePlanSlots, planPayload, reorderPlanSlots, type PlanProposalKind, type PlanSlot, type PlanSlotStatus, type PrivatePlan } from "../plan-model";
import type { OperatorActionDefinition, OperatorActor, OperatorRuntime } from "../types";
import { OperatorCommandError, OperatorConflictError } from "../types";

export const privateWriteHandlerCalls = { count: 0 };
export function resetPrivateWriteHandlerCalls() {
  privateWriteHandlerCalls.count = 0;
}

const slotStatus = z.enum(["idea", "draft", "prepared", "ready-for-review", "blocked"]);
const proposalKind = z.enum(["carousel", "article", "automation", "topic"]);

function counted(definition: OperatorActionDefinition): OperatorActionDefinition {
  const handler = definition.handler;
  return {
    ...definition,
    async handler(input, actor, runtime) {
      privateWriteHandlerCalls.count += 1;
      return handler(input, actor, runtime);
    }
  };
}

function storeOf(runtime: OperatorRuntime) {
  if (!runtime?.store || !runtime.sessionId) throw new Error("Grokbot persistence is not available for that action.");
  return runtime;
}

function asPlanResult(summary: string, plan: PrivatePlan) {
  return { summary, data: planPayload(plan) as unknown as Record<string, unknown> };
}

async function ownedPlan(runtime: OperatorRuntime, actor: OperatorActor, planId: string) {
  const loaded = await runtime.store.getPlan(planId, actor.userId);
  if (loaded.status === "denied") throw new OperatorCommandError("OperatorSessionDenied", "That plan belongs to another Studio user.");
  if (loaded.status !== "ok") throw new Error("That plan was not found.");
  return loaded.plan;
}

function assertSaved(result: { ok: true; plan: PrivatePlan } | { ok: false; conflict?: boolean; currentRevision?: number; planId?: string; missing?: boolean; denied?: boolean }) {
  if (result.ok) return result.plan;
  if ("conflict" in result && result.conflict && result.planId && typeof result.currentRevision === "number") {
    throw new OperatorConflictError(result.planId, result.currentRevision);
  }
  if ("denied" in result && result.denied) throw new OperatorCommandError("OperatorSessionDenied", "That plan belongs to another Studio user.");
  throw new Error("That plan was not found.");
}

async function proposalSeeds(): Promise<Array<{ title: string; summary: string; pathwaySlugs: string[]; recipeKey?: string | null }>> {
  try {
    const snapshot = await getSolOperatorSnapshot();
    return snapshot.proposals
      .filter((proposal) => proposal.status === "pending")
      .slice(0, 14)
      .map((proposal) => ({
        title: proposal.title,
        summary: proposal.summary,
        pathwaySlugs: proposal.pathwaySlugs,
        recipeKey: proposal.recipeKey
      }));
  } catch {
    return [];
  }
}

const planCreate: OperatorActionDefinition = counted({
  name: "plan.create",
  description: "Save a private 14-day plan from the canonical editorial window. Nothing is published or scheduled.",
  permission: "manage_content",
  classification: "private_write",
  inputSchema: z.object({
    title: z.string().trim().min(1).max(180).optional(),
    timezone: z.string().trim().min(1).max(80).default("America/New_York"),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: z.number().int().min(1).max(14).default(14)
  }).strict(),
  async handler(input, actor, runtime) {
    const { store, sessionId } = storeOf(runtime);
    const value = input as { title?: string; timezone?: string; startsOn?: string; days?: number };
    const startsOn = value.startsOn || editorialDate();
    const days = value.days ?? 14;
    const now = new Date().toISOString();
    const plan: PrivatePlan = {
      id: randomUUID(),
      ownerUserId: actor.userId,
      sessionId,
      title: value.title || `${days}-day plan · ${startsOn}`,
      timezone: value.timezone || "America/New_York",
      startsOn,
      revision: 1,
      slots: buildPrivatePlanSlots({ start: startsOn, days, proposals: await proposalSeeds(), id: () => randomUUID() }),
      revisions: [{
        revision: 1,
        reason: "Created from the canonical editorial window and current Sol proposals. Nothing was published or scheduled.",
        createdAt: now,
        changes: ["Created private plan"]
      }],
      createdAt: now,
      updatedAt: now
    };
    const saved = await store.createPlan(plan);
    return asPlanResult(`Saved a private ${saved.slots.length}-day plan at revision ${saved.revision}. Nothing was published or scheduled.`, saved);
  }
});

const planList: OperatorActionDefinition = {
  name: "plan.list",
  description: "List this Studio user's private plans.",
  permission: "view_content",
  classification: "read",
  inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(20) }).strict(),
  async handler(input, actor, runtime) {
    const { store } = storeOf(runtime);
    const limit = Number((input as { limit?: number }).limit ?? 20);
    const plans = await store.listPlans(actor.userId, limit);
    return {
      summary: plans.length ? `${plans.length} private plans.` : "No private plans yet.",
      data: {
        saved: true,
        published: false,
        plans: plans.map((plan) => ({
          id: plan.id,
          title: plan.title,
          startsOn: plan.startsOn,
          timezone: plan.timezone,
          revision: plan.revision,
          slotCount: plan.slots.length,
          updatedAt: plan.updatedAt
        }))
      }
    };
  }
};

const planInspect: OperatorActionDefinition = {
  name: "plan.inspect",
  description: "Reopen one private plan owned by the current Studio user.",
  permission: "view_content",
  classification: "read",
  inputSchema: z.object({ planId: z.string().uuid() }).strict(),
  async handler(input, actor, runtime) {
    const plan = await ownedPlan(storeOf(runtime), actor, String((input as { planId: string }).planId));
    return asPlanResult(`Reopened “${plan.title}” at revision ${plan.revision}.`, plan);
  }
};

const slotPatch = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(180).optional(),
  pathwaySlug: z.string().trim().min(1).max(80).nullable().optional(),
  goal: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(500).optional(),
  suggestedTopic: z.string().trim().max(180).optional(),
  whyNow: z.string().trim().max(500).optional(),
  nextSteps: z.string().trim().max(500).optional(),
  status: slotStatus.optional(),
  proposalKind: proposalKind.optional(),
  dependencies: z.array(z.string().trim().min(1).max(180)).max(8).optional()
}).strict();

const planUpdate: OperatorActionDefinition = counted({
  name: "plan.update",
  description: "Edit a private plan. A stale revision is rejected instead of overwriting.",
  permission: "manage_content",
  classification: "private_write",
  inputSchema: z.object({
    planId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(180).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    slots: z.array(slotPatch).max(14).optional()
  }).strict(),
  async handler(input, actor, runtime) {
    const value = input as {
      planId: string;
      expectedRevision: number;
      reason: string;
      title?: string;
      timezone?: string;
      slots?: Array<Partial<PlanSlot> & { id: string }>;
    };
    const current = await ownedPlan(storeOf(runtime), actor, value.planId);
    const slots = current.slots.map((slot) => {
      const patch = value.slots?.find((item) => item.id === slot.id);
      if (!patch) return slot;
      return {
        ...slot,
        title: patch.title ?? slot.title,
        pathwaySlug: patch.pathwaySlug === undefined ? slot.pathwaySlug : patch.pathwaySlug,
        goal: patch.goal ?? slot.goal,
        reason: patch.reason ?? slot.reason,
        suggestedTopic: patch.suggestedTopic ?? slot.suggestedTopic,
        whyNow: patch.whyNow ?? slot.whyNow,
        nextSteps: patch.nextSteps ?? slot.nextSteps,
        status: (patch.status as PlanSlotStatus | undefined) ?? slot.status,
        proposalKind: (patch.proposalKind as PlanProposalKind | undefined) ?? slot.proposalKind,
        dependencies: patch.dependencies ?? slot.dependencies
      };
    });
    const applied = applyPlanWrite(current, {
      expectedRevision: value.expectedRevision,
      reason: value.reason,
      title: value.title,
      timezone: value.timezone,
      slots,
      now: new Date().toISOString()
    });
    if (!applied.ok) throw new OperatorConflictError(applied.planId, applied.currentRevision);
    const saved = assertSaved(await storeOf(runtime).store.savePlan(actor.userId, applied.plan, value.expectedRevision));
    return asPlanResult(`Saved “${saved.title}” at revision ${saved.revision}. Nothing was published.`, saved);
  }
});

const planReorder: OperatorActionDefinition = counted({
  name: "plan.reorder",
  description: "Reorder private plan slots across the existing dates.",
  permission: "manage_content",
  classification: "private_write",
  inputSchema: z.object({
    planId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    orderedSlotIds: z.array(z.string().uuid()).min(1).max(14),
    reason: z.string().trim().min(1).max(300).default("Reordered slots")
  }).strict(),
  async handler(input, actor, runtime) {
    const value = input as { planId: string; expectedRevision: number; orderedSlotIds: string[]; reason?: string };
    const current = await ownedPlan(storeOf(runtime), actor, value.planId);
    const slots = reorderPlanSlots(current.slots, value.orderedSlotIds);
    const applied = applyPlanWrite(current, {
      expectedRevision: value.expectedRevision,
      reason: value.reason || "Reordered slots",
      slots,
      now: new Date().toISOString()
    });
    if (!applied.ok) throw new OperatorConflictError(applied.planId, applied.currentRevision);
    const saved = assertSaved(await storeOf(runtime).store.savePlan(actor.userId, applied.plan, value.expectedRevision));
    return asPlanResult(`Reordered “${saved.title}” at revision ${saved.revision}.`, saved);
  }
});

const planDuplicate: OperatorActionDefinition = counted({
  name: "plan.duplicate",
  description: "Copy a private plan into a new revision 1 draft.",
  permission: "manage_content",
  classification: "private_write",
  inputSchema: z.object({ planId: z.string().uuid() }).strict(),
  async handler(input, actor, runtime) {
    const { store, sessionId } = storeOf(runtime);
    const current = await ownedPlan(runtime, actor, String((input as { planId: string }).planId));
    const now = new Date().toISOString();
    const copy: PrivatePlan = {
      ...current,
      id: randomUUID(),
      ownerUserId: actor.userId,
      sessionId,
      title: `Copy of ${current.title}`.slice(0, 180),
      revision: 1,
      slots: current.slots.map((slot) => ({ ...slot, id: randomUUID(), dependencies: [...slot.dependencies] })),
      revisions: [{ revision: 1, reason: `Duplicated from ${current.id} revision ${current.revision}.`, createdAt: now, changes: ["Duplicated private plan"] }],
      createdAt: now,
      updatedAt: now
    };
    const saved = await store.createPlan(copy);
    return asPlanResult(`Duplicated “${current.title}” into a new private plan. Nothing was published.`, saved);
  }
});

const planPreview: OperatorActionDefinition = {
  name: "plan.preview",
  description: "Preview a saved private plan, or the unsaved editorial window when no plan is named.",
  permission: "view_content",
  classification: "read",
  inputSchema: z.object({
    planId: z.string().uuid().optional(),
    days: z.number().int().min(1).max(14).default(14)
  }).strict(),
  async handler(input, actor, runtime) {
    const value = input as { planId?: string; days?: number };
    if (value.planId) {
      const plan = await ownedPlan(storeOf(runtime), actor, value.planId);
      return asPlanResult(`Previewing saved plan “${plan.title}”. Nothing was published.`, plan);
    }
    const days = value.days ?? 14;
    const slots = buildPrivatePlanSlots({ days, proposals: await proposalSeeds(), id: () => randomUUID() });
    return {
      summary: `Suggestion only: ${slots.length} editorial days. Nothing was saved, scheduled, or published.`,
      data: { saved: false, published: false, suggestionOnly: true, scheduled: false, days: slots.length, slots }
    };
  }
};

const sessionList: OperatorActionDefinition = {
  name: "session.list",
  description: "List this Studio user's Grokbot sessions.",
  permission: "view_workspace",
  classification: "read",
  inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict(),
  async handler(input, actor, runtime) {
    const sessions = await storeOf(runtime).store.listSessions(actor.userId, Number((input as { limit?: number }).limit ?? 20));
    return { summary: `${sessions.length} Grokbot sessions.`, data: { sessions } };
  }
};

const sessionArchive: OperatorActionDefinition = counted({
  name: "session.archive",
  description: "Archive one of this Studio user's Grokbot sessions.",
  permission: "view_workspace",
  classification: "private_write",
  inputSchema: z.object({ sessionId: z.string().uuid() }).strict(),
  async handler(input, actor, runtime) {
    const sessionId = String((input as { sessionId: string }).sessionId);
    const result = await storeOf(runtime).store.archiveSession(sessionId, actor.userId);
    if (result.status === "denied") throw new OperatorCommandError("OperatorSessionDenied", "That Grokbot session belongs to another Studio user.");
    if (result.status === "missing") throw new OperatorCommandError("OperatorSessionMissing", "That Grokbot session was not found.");
    return { summary: "Archived that Grokbot session.", data: { sessionId, status: "archived" } };
  }
});

const scratchSave: OperatorActionDefinition = counted({
  name: "scratch.save",
  description: "Save private scratch text. It is not canonical Pathway content.",
  permission: "manage_content",
  classification: "private_write",
  inputSchema: z.object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(8000),
    kind: z.enum(["text", "hook", "outline"]).default("text"),
    linkedAssetIds: z.array(z.string().uuid()).max(8).default([])
  }).strict(),
  async handler(input, actor, runtime) {
    const value = input as { id?: string; title: string; body: string; kind?: "text" | "hook" | "outline"; linkedAssetIds?: string[] };
    const { store, sessionId } = storeOf(runtime);
    const now = new Date().toISOString();
    const saved = await store.saveScratch({
      id: value.id || randomUUID(),
      ownerUserId: actor.userId,
      sessionId,
      title: value.title,
      body: value.body,
      kind: value.kind || "text",
      linkedAssetIds: value.linkedAssetIds ?? [],
      canonical: false,
      createdAt: now,
      updatedAt: now
    });
    return {
      summary: `Saved scratch “${saved.title}”. It is not canonical content.`,
      data: { scratchId: saved.id, canonical: false, saved: true, published: false, note: saved }
    };
  }
});

const scratchList: OperatorActionDefinition = {
  name: "scratch.list",
  description: "List private scratch notes for this Studio user.",
  permission: "view_content",
  classification: "read",
  inputSchema: z.object({}).strict(),
  async handler(_input, actor, runtime) {
    const notes = await storeOf(runtime).store.listScratch(actor.userId, runtime.sessionId);
    return {
      summary: notes.length ? `${notes.length} scratch notes.` : "No scratch notes yet.",
      data: { canonical: false, notes }
    };
  }
};

const assetLink: OperatorActionDefinition = counted({
  name: "asset.link",
  description: "Link an owned private Pathway asset to this Grokbot session.",
  permission: "manage_content",
  classification: "private_write",
  inputSchema: z.object({
    assetId: z.string().uuid(),
    use: z.enum(["reference", "draft_source"]).default("reference")
  }).strict(),
  async handler(input, actor, runtime) {
    const value = input as { assetId: string; use?: "reference" | "draft_source" };
    const linked = await storeOf(runtime).store.linkAsset({
      ownerUserId: actor.userId,
      sessionId: runtime.sessionId,
      assetId: value.assetId,
      use: value.use || "reference"
    });
    if (!linked.ok && "missing" in linked && linked.missing) throw new OperatorCommandError("OperatorAssetMissing", "That Pathway asset was not found.");
    if (!linked.ok) throw new OperatorCommandError("OperatorAssetDenied", "That Pathway asset belongs to another Studio user.");
    return {
      summary: linked.created
        ? `Linked private asset ${linked.asset.assetId} as ${linked.asset.use}.`
        : `That private asset was already linked. Use is now ${linked.asset.use}.`,
      data: {
        assetId: linked.asset.assetId,
        linkId: linked.asset.id,
        filename: linked.asset.filename,
        mimeType: linked.asset.mimeType,
        bytes: linked.asset.bytes,
        use: linked.asset.use,
        previewUrl: linked.asset.previewUrl,
        pathwaySlug: linked.asset.pathwaySlug,
        storage: "private",
        published: false,
        created: linked.created
      }
    };
  }
});

const assetList: OperatorActionDefinition = {
  name: "asset.list",
  description: "List private Pathway assets linked to this Grokbot session.",
  permission: "view_content",
  classification: "read",
  inputSchema: z.object({}).strict(),
  async handler(_input, actor, runtime) {
    const assets = await storeOf(runtime).store.listAssets(actor.userId, runtime.sessionId);
    return {
      summary: assets.length ? `${assets.length} private assets linked to this session.` : "No private assets are linked to this session.",
      data: { storage: "private", published: false, assets }
    };
  }
};

export const privateActions: OperatorActionDefinition[] = [
  planCreate,
  planList,
  planInspect,
  planUpdate,
  planReorder,
  planDuplicate,
  planPreview,
  sessionList,
  sessionArchive,
  scratchSave,
  scratchList,
  assetLink,
  assetList
];

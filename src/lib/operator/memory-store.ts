import { randomUUID } from "node:crypto";
import { clonePlan } from "./plan-model";
import type { PrivatePlan } from "./plan-model";
import { boundedResult, redactOperatorText } from "./redact";
import type { LinkedAsset, OperatorSessionView, OperatorStore, OwnedAssetRecord, PlanWriteResult, ScratchNote, SessionAccess, SessionSummary, StoredExecution } from "./store";
import type { OperatorRunRecord, OperatorSessionContext } from "./types";

const MAX_RUNS = 200;
const VISIBLE_RUNS = 80;

type SessionState = {
  id: string;
  ownerUserId: string;
  workspaceKey: string;
  context: OperatorSessionContext;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  records: Array<OperatorRunRecord & { data: Record<string, unknown> }>;
};

function emptyContext(input?: Partial<OperatorSessionContext> | null): OperatorSessionContext {
  return {
    pathwaySlug: input?.pathwaySlug ?? null,
    projectId: input?.projectId ?? null,
    planId: input?.planId ?? null
  };
}

function view(session: SessionState): OperatorSessionView {
  return {
    id: session.id,
    ownerUserId: session.ownerUserId,
    workspaceKey: session.workspaceKey,
    context: { ...session.context },
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    records: session.records.slice(-VISIBLE_RUNS).map((record) => ({
      id: record.id,
      sessionId: record.sessionId,
      actorUserId: record.actorUserId,
      requestId: record.requestId,
      command: record.command,
      action: record.action,
      classification: record.classification,
      permission: record.permission,
      approvalRequired: record.approvalRequired,
      status: record.status,
      summary: record.summary,
      createdAt: record.createdAt,
      context: { ...record.context }
    }))
  };
}

function executionFrom(session: SessionState, record: SessionState["records"][number]): StoredExecution {
  return {
    record: { ...record, context: { ...record.context } },
    data: { ...(record.data ?? {}) },
    sessionId: session.id
  };
}

export type MemoryOperatorStore = OperatorStore & {
  seedAsset(asset: OwnedAssetRecord): void;
  readAsset(assetId: string): OwnedAssetRecord | null;
};

export function createMemoryOperatorStore(): MemoryOperatorStore {
  const sessions = new Map<string, SessionState>();
  const plans = new Map<string, PrivatePlan>();
  const notes = new Map<string, ScratchNote>();
  const assets = new Map<string, OwnedAssetRecord>();
  const links = new Map<string, LinkedAsset>();

  function requireOwnedSession(sessionId: string, ownerUserId: string): SessionAccess {
    const session = sessions.get(sessionId);
    if (!session) return { status: "missing" };
    if (session.ownerUserId !== ownerUserId) return { status: "denied" };
    if (session.status === "archived") return { status: "archived", session: view(session) };
    return { status: "ok", session: view(session) };
  }

  function touch(session: SessionState) {
    session.updatedAt = new Date().toISOString();
    if (session.records.length > MAX_RUNS) session.records.splice(0, session.records.length - MAX_RUNS);
  }

  const store: MemoryOperatorStore = {
    async createSession(input) {
      const now = new Date().toISOString();
      const session: SessionState = {
        id: randomUUID(),
        ownerUserId: input.ownerUserId,
        workspaceKey: (input.workspaceKey || "studio").slice(0, 80),
        context: emptyContext(input.context),
        status: "active",
        createdAt: now,
        updatedAt: now,
        records: []
      };
      sessions.set(session.id, session);
      return view(session);
    },
    async readSession(sessionId, ownerUserId) {
      return requireOwnedSession(sessionId, ownerUserId);
    },
    async listSessions(ownerUserId, limit) {
      const rows = [...sessions.values()]
        .filter((session) => session.ownerUserId === ownerUserId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, limit);
      return rows.map((session): SessionSummary => ({
        id: session.id,
        workspaceKey: session.workspaceKey,
        context: { ...session.context },
        status: session.status,
        updatedAt: session.updatedAt,
        runCount: session.records.length
      }));
    },
    async archiveSession(sessionId, ownerUserId) {
      const session = sessions.get(sessionId);
      if (!session) return { status: "missing" };
      if (session.ownerUserId !== ownerUserId) return { status: "denied" };
      session.status = "archived";
      touch(session);
      return { status: "archived", session: view(session) };
    },
    async touchContext(sessionId, ownerUserId, context) {
      const session = sessions.get(sessionId);
      if (!session || session.ownerUserId !== ownerUserId || session.status === "archived") return;
      session.context = { ...context };
      touch(session);
    },
    async findRun(ownerUserId, requestId) {
      for (const session of sessions.values()) {
        if (session.ownerUserId !== ownerUserId) continue;
        const record = session.records.find((item) => item.requestId === requestId);
        if (record) return executionFrom(session, record);
      }
      return null;
    },
    async claimRun(input) {
      const existing = await store.findRun(input.ownerUserId, input.requestId);
      if (existing?.record.status === "pending") return { state: "pending" };
      if (existing) return { state: "replay", execution: existing };
      const session = sessions.get(input.sessionId);
      if (!session || session.ownerUserId !== input.ownerUserId) {
        throw new Error("Grokbot could not record that command.");
      }
      const record: SessionState["records"][number] = {
        id: randomUUID(),
        sessionId: session.id,
        actorUserId: input.ownerUserId,
        requestId: input.requestId,
        command: redactOperatorText(input.command),
        action: null,
        classification: null,
        permission: null,
        approvalRequired: false,
        status: "pending",
        summary: "Running",
        createdAt: new Date().toISOString(),
        context: { ...input.context },
        data: {}
      };
      session.records.push(record);
      touch(session);
      return { state: "fresh", runId: record.id };
    },
    async completeRun(input) {
      for (const session of sessions.values()) {
        const record = session.records.find((item) => item.id === input.runId && item.actorUserId === input.ownerUserId);
        if (!record) continue;
        record.action = input.action;
        record.classification = input.classification;
        record.permission = input.permission;
        record.approvalRequired = input.approvalRequired;
        record.status = input.status;
        record.summary = redactOperatorText(input.summary);
        record.context = { ...input.context };
        record.data = boundedResult(input.data);
        session.context = { ...input.context };
        touch(session);
        return { ...record, context: { ...record.context } };
      }
      throw new Error("Grokbot could not record that command.");
    },
    async appendRun(input) {
      const session = sessions.get(input.sessionId);
      if (!session || session.ownerUserId !== input.ownerUserId) throw new Error("Grokbot could not record that command.");
      if (input.requestId) {
        const existing = session.records.find((item) => item.requestId === input.requestId);
        if (existing) return { ...existing, context: { ...existing.context } };
      }
      const record: SessionState["records"][number] = {
        id: randomUUID(),
        sessionId: session.id,
        actorUserId: input.ownerUserId,
        requestId: input.requestId,
        command: redactOperatorText(input.command),
        action: input.action,
        classification: input.classification,
        permission: input.permission,
        approvalRequired: input.approvalRequired,
        status: input.status,
        summary: redactOperatorText(input.summary),
        createdAt: new Date().toISOString(),
        context: { ...input.context },
        data: boundedResult(input.data)
      };
      session.records.push(record);
      session.context = { ...input.context };
      touch(session);
      return { ...record, context: { ...record.context } };
    },
    async createPlan(plan) {
      const stored = clonePlan(plan);
      plans.set(stored.id, stored);
      return clonePlan(stored);
    },
    async listPlans(ownerUserId, limit) {
      return [...plans.values()]
        .filter((plan) => plan.ownerUserId === ownerUserId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, limit)
        .map(clonePlan);
    },
    async getPlan(planId, ownerUserId) {
      const plan = plans.get(planId);
      if (!plan) return { status: "missing" };
      if (plan.ownerUserId !== ownerUserId) return { status: "denied" };
      return { status: "ok", plan: clonePlan(plan) };
    },
    async savePlan(ownerUserId, plan, expectedRevision) {
      const current = plans.get(plan.id);
      if (!current) return { ok: false, missing: true };
      if (current.ownerUserId !== ownerUserId) return { ok: false, denied: true };
      if (current.revision !== expectedRevision) {
        return { ok: false, conflict: true, currentRevision: current.revision, planId: plan.id };
      }
      const stored = clonePlan(plan);
      plans.set(plan.id, stored);
      return { ok: true, plan: clonePlan(stored) } satisfies PlanWriteResult;
    },
    async saveScratch(note) {
      const existing = notes.get(note.id);
      if (existing && existing.ownerUserId !== note.ownerUserId) {
        throw new Error("That scratch note belongs to another Studio user.");
      }
      const stored: ScratchNote = { ...note, linkedAssetIds: [...note.linkedAssetIds], canonical: false, body: note.body.slice(0, 8000) };
      notes.set(stored.id, stored);
      return { ...stored, linkedAssetIds: [...stored.linkedAssetIds] };
    },
    async listScratch(ownerUserId, sessionId) {
      return [...notes.values()]
        .filter((note) => note.ownerUserId === ownerUserId && (!sessionId || note.sessionId === sessionId))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 40)
        .map((note) => ({ ...note, linkedAssetIds: [...note.linkedAssetIds], canonical: false as const }));
    },
    async linkAsset(input) {
      const asset = assets.get(input.assetId);
      if (!asset) return { ok: false, missing: true };
      if (!asset.ownerUserId || asset.ownerUserId !== input.ownerUserId) return { ok: false, denied: true };
      const session = sessions.get(input.sessionId);
      if (!session || session.ownerUserId !== input.ownerUserId) return { ok: false, denied: true };
      const existing = [...links.values()].find((link) => link.sessionId === input.sessionId && link.assetId === input.assetId);
      if (existing) {
        existing.use = input.use;
        return { ok: true, asset: { ...existing }, created: false };
      }
      const linked: LinkedAsset = {
        id: randomUUID(),
        assetId: asset.id,
        sessionId: input.sessionId,
        pathwaySlug: asset.pathwaySlug,
        filename: asset.filename,
        mimeType: asset.mimeType,
        bytes: asset.bytes,
        use: input.use,
        previewUrl: null,
        storage: "private",
        createdAt: new Date().toISOString()
      };
      links.set(linked.id, linked);
      return { ok: true, asset: { ...linked }, created: true };
    },
    async listAssets(ownerUserId, sessionId) {
      const session = sessions.get(sessionId);
      if (!session || session.ownerUserId !== ownerUserId) return [];
      return [...links.values()]
        .filter((link) => link.sessionId === sessionId)
        .map((link) => ({ ...link, storage: "private" as const, previewUrl: null }));
    },
    seedAsset(asset) {
      assets.set(asset.id, { ...asset, publicUrl: asset.publicUrl });
    },
    readAsset(assetId) {
      const asset = assets.get(assetId);
      return asset ? { ...asset } : null;
    }
  };
  return store;
}

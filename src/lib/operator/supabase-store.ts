import { randomUUID } from "node:crypto";
import { PATHWAY_ASSET_STORAGE_PROVIDER } from "@/pathway-asset-ingest";
import { createServiceClient, isSupabaseServiceConfigured } from "@/supabase";
import { clonePlan, type PlanRevisionNote, type PlanSlot, type PrivatePlan } from "./plan-model";
import { boundedResult, redactOperatorText } from "./redact";
import type { AssetLinkResult, LinkedAsset, OperatorSessionView, OperatorStore, PlanWriteResult, ScratchNote, SessionAccess, SessionSummary, StoredExecution } from "./store";
import type { OperatorRunRecord, OperatorRunStatus, OperatorSessionContext } from "./types";

type Service = NonNullable<ReturnType<typeof createServiceClient>>;

const VISIBLE_RUNS = 80;

function contextOf(row: { pathway_slug?: string | null; project_id?: string | null; plan_id?: string | null; context?: unknown }): OperatorSessionContext {
  if (row.context && typeof row.context === "object") {
    const context = row.context as Partial<OperatorSessionContext>;
    return {
      pathwaySlug: context.pathwaySlug ?? row.pathway_slug ?? null,
      projectId: context.projectId ?? row.project_id ?? null,
      planId: context.planId ?? row.plan_id ?? null
    };
  }
  return {
    pathwaySlug: row.pathway_slug ?? null,
    projectId: row.project_id ?? null,
    planId: row.plan_id ?? null
  };
}

function runFrom(row: Record<string, unknown>): OperatorRunRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    actorUserId: String(row.owner_user_id),
    requestId: row.request_id ? String(row.request_id) : null,
    command: String(row.command ?? ""),
    action: row.action ? String(row.action) : null,
    classification: (row.classification as OperatorRunRecord["classification"]) ?? null,
    permission: (row.permission as OperatorRunRecord["permission"]) ?? null,
    approvalRequired: Boolean(row.approval_required),
    status: String(row.status) as OperatorRunStatus,
    summary: String(row.summary ?? ""),
    createdAt: String(row.created_at),
    context: contextOf(row)
  };
}

function executionFrom(row: Record<string, unknown>): StoredExecution {
  const data = row.result_refs && typeof row.result_refs === "object" ? { ...(row.result_refs as Record<string, unknown>) } : {};
  return { record: runFrom(row), data, sessionId: String(row.session_id) };
}

async function signedPreview(service: Service, asset: { id: string; storage_bucket: string | null; storage_path: string | null }) {
  if (asset.storage_bucket === "studio-social" && asset.storage_path) {
    const signed = await service.storage.from("studio-social").createSignedUrl(asset.storage_path, 60 * 60);
    return signed.data?.signedUrl ?? null;
  }
  if (asset.storage_bucket === PATHWAY_ASSET_STORAGE_PROVIDER && asset.storage_path) {
    return `/api/admin/pathway-assets/file?id=${asset.id}`;
  }
  return null;
}

export function createSupabaseOperatorStore(): OperatorStore | null {
  if (!isSupabaseServiceConfigured()) return null;
  const created = createServiceClient();
  if (!created) return null;
  const service: Service = created;

  async function loadRuns(sessionId: string, ownerUserId: string) {
    const result = await service.from("grokbot_runs").select("*").eq("session_id", sessionId).eq("owner_user_id", ownerUserId).order("created_at", { ascending: false }).limit(VISIBLE_RUNS);
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []).reverse().map((row) => runFrom(row as Record<string, unknown>));
  }

  async function sessionById(sessionId: string): Promise<Record<string, unknown> | null> {
    const result = await service.from("grokbot_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    return result.data as Record<string, unknown> | null;
  }

  async function viewOf(row: Record<string, unknown>, ownerUserId: string): Promise<OperatorSessionView> {
    return {
      id: String(row.id),
      ownerUserId: String(row.owner_user_id),
      workspaceKey: String(row.workspace_key),
      context: contextOf(row),
      status: row.status === "archived" ? "archived" : "active",
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      records: await loadRuns(String(row.id), ownerUserId)
    };
  }

  async function access(sessionId: string, ownerUserId: string): Promise<SessionAccess> {
    const row = await sessionById(sessionId);
    if (!row) return { status: "missing" };
    if (String(row.owner_user_id) !== ownerUserId) return { status: "denied" };
    const session = await viewOf(row, ownerUserId);
    if (session.status === "archived") return { status: "archived", session };
    return { status: "ok", session };
  }

  async function loadPlan(planId: string): Promise<PrivatePlan | null> {
    const [plan, slots, revisions] = await Promise.all([
      service.from("grokbot_plans").select("*").eq("id", planId).maybeSingle(),
      service.from("grokbot_plan_slots").select("*").eq("plan_id", planId).order("position", { ascending: true }),
      service.from("grokbot_plan_revisions").select("*").eq("plan_id", planId).order("revision", { ascending: true })
    ]);
    if (plan.error) throw new Error(plan.error.message);
    if (slots.error) throw new Error(slots.error.message);
    if (revisions.error) throw new Error(revisions.error.message);
    if (!plan.data) return null;
    const row = plan.data as Record<string, unknown>;
    return {
      id: String(row.id),
      ownerUserId: String(row.owner_user_id),
      sessionId: row.session_id ? String(row.session_id) : null,
      title: String(row.title),
      timezone: String(row.timezone),
      startsOn: String(row.starts_on).slice(0, 10),
      revision: Number(row.revision),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      slots: ((slots.data ?? []) as Array<Record<string, unknown>>).map((slot) => ({
        id: String(slot.id),
        position: Number(slot.position),
        slotDate: String(slot.slot_date).slice(0, 10),
        title: String(slot.title),
        pathwaySlug: slot.pathway_slug ? String(slot.pathway_slug) : null,
        goal: String(slot.goal ?? ""),
        reason: String(slot.reason ?? ""),
        suggestedTopic: String(slot.suggested_topic ?? ""),
        whyNow: String(slot.why_now ?? ""),
        nextSteps: String(slot.next_steps ?? ""),
        dependencies: Array.isArray(slot.dependencies) ? slot.dependencies.map(String) : [],
        status: slot.status as PlanSlot["status"],
        proposalKind: slot.proposal_kind as PlanSlot["proposalKind"]
      })),
      revisions: ((revisions.data ?? []) as Array<Record<string, unknown>>).map((revision): PlanRevisionNote => ({
        revision: Number(revision.revision),
        reason: String(revision.reason),
        createdAt: String(revision.created_at),
        changes: Array.isArray(revision.changes) ? revision.changes.map(String).slice(0, 40) : []
      }))
    };
  }

  const store: OperatorStore = {
    async createSession(input) {
      const now = new Date().toISOString();
      const id = randomUUID();
      const context = {
        pathwaySlug: input.context?.pathwaySlug ?? null,
        projectId: input.context?.projectId ?? null,
        planId: input.context?.planId ?? null
      };
      const inserted = await service.from("grokbot_sessions").insert({
        id,
        owner_user_id: input.ownerUserId,
        workspace_key: (input.workspaceKey || "studio").slice(0, 80),
        pathway_slug: context.pathwaySlug,
        project_id: context.projectId,
        plan_id: context.planId,
        status: "active",
        created_at: now,
        updated_at: now
      }).select("*").single();
      if (inserted.error) throw new Error(inserted.error.message);
      return viewOf(inserted.data as Record<string, unknown>, input.ownerUserId);
    },
    readSession: access,
    async listSessions(ownerUserId, limit) {
      const result = await service.from("grokbot_sessions").select("id, workspace_key, pathway_slug, project_id, plan_id, status, updated_at").eq("owner_user_id", ownerUserId).order("updated_at", { ascending: false }).limit(limit);
      if (result.error) throw new Error(result.error.message);
      const rows = (result.data ?? []) as Array<Record<string, unknown>>;
      const summaries: SessionSummary[] = [];
      for (const row of rows) {
        const count = await service.from("grokbot_runs").select("id", { count: "exact", head: true }).eq("session_id", String(row.id)).eq("owner_user_id", ownerUserId);
        summaries.push({
          id: String(row.id),
          workspaceKey: String(row.workspace_key),
          context: contextOf(row),
          status: row.status === "archived" ? "archived" : "active",
          updatedAt: String(row.updated_at),
          runCount: count.count ?? 0
        });
      }
      return summaries;
    },
    async archiveSession(sessionId, ownerUserId) {
      const current = await access(sessionId, ownerUserId);
      if (current.status === "missing" || current.status === "denied") return current;
      const updated = await service.from("grokbot_sessions").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", sessionId).eq("owner_user_id", ownerUserId).select("*").single();
      if (updated.error) throw new Error(updated.error.message);
      return { status: "archived", session: await viewOf(updated.data as Record<string, unknown>, ownerUserId) };
    },
    async touchContext(sessionId, ownerUserId, context) {
      const updated = await service.from("grokbot_sessions").update({
        pathway_slug: context.pathwaySlug,
        project_id: context.projectId,
        plan_id: context.planId,
        updated_at: new Date().toISOString()
      }).eq("id", sessionId).eq("owner_user_id", ownerUserId).eq("status", "active");
      if (updated.error) throw new Error(updated.error.message);
    },
    async findRun(ownerUserId, requestId) {
      const result = await service.from("grokbot_runs").select("*").eq("owner_user_id", ownerUserId).eq("request_id", requestId).maybeSingle();
      if (result.error) throw new Error(result.error.message);
      if (!result.data) return null;
      return executionFrom(result.data as Record<string, unknown>);
    },
    async claimRun(input) {
      const existing = await store.findRun(input.ownerUserId, input.requestId);
      if (existing?.record.status === "pending") return { state: "pending" };
      if (existing) return { state: "replay", execution: existing };
      const inserted = await service.from("grokbot_runs").insert({
        id: randomUUID(),
        session_id: input.sessionId,
        owner_user_id: input.ownerUserId,
        request_id: input.requestId,
        command: redactOperatorText(input.command),
        status: "pending",
        summary: "Running",
        approval_required: false,
        result_refs: {},
        context: input.context,
        created_at: new Date().toISOString()
      }).select("*").single();
      if (inserted.error) {
        if (inserted.error.code === "23505") {
          const raced = await store.findRun(input.ownerUserId, input.requestId);
          if (raced?.record.status === "pending") return { state: "pending" };
          if (raced) return { state: "replay", execution: raced };
        }
        throw new Error(inserted.error.message);
      }
      return { state: "fresh", runId: String((inserted.data as { id: string }).id) };
    },
    async completeRun(input) {
      const updated = await service.from("grokbot_runs").update({
        action: input.action,
        classification: input.classification,
        permission: input.permission,
        approval_required: input.approvalRequired,
        status: input.status,
        summary: redactOperatorText(input.summary),
        context: input.context,
        result_refs: boundedResult(input.data)
      }).eq("id", input.runId).eq("owner_user_id", input.ownerUserId).select("*").single();
      if (updated.error) throw new Error(updated.error.message);
      await service.from("grokbot_sessions").update({
        pathway_slug: input.context.pathwaySlug,
        project_id: input.context.projectId,
        plan_id: input.context.planId,
        updated_at: new Date().toISOString()
      }).eq("id", String((updated.data as { session_id: string }).session_id)).eq("owner_user_id", input.ownerUserId);
      return runFrom(updated.data as Record<string, unknown>);
    },
    async appendRun(input) {
      if (input.requestId) {
        const existing = await store.findRun(input.ownerUserId, input.requestId);
        if (existing) return existing.record;
      }
      const inserted = await service.from("grokbot_runs").insert({
        id: randomUUID(),
        session_id: input.sessionId,
        owner_user_id: input.ownerUserId,
        request_id: input.requestId,
        command: redactOperatorText(input.command),
        action: input.action,
        classification: input.classification,
        permission: input.permission,
        approval_required: input.approvalRequired,
        status: input.status,
        summary: redactOperatorText(input.summary),
        result_refs: boundedResult(input.data),
        context: input.context,
        created_at: new Date().toISOString()
      }).select("*").single();
      if (inserted.error) throw new Error(inserted.error.message);
      await service.from("grokbot_sessions").update({
        pathway_slug: input.context.pathwaySlug,
        project_id: input.context.projectId,
        plan_id: input.context.planId,
        updated_at: new Date().toISOString()
      }).eq("id", input.sessionId).eq("owner_user_id", input.ownerUserId);
      return runFrom(inserted.data as Record<string, unknown>);
    },
    async createPlan(plan) {
      const inserted = await service.from("grokbot_plans").insert({
        id: plan.id,
        owner_user_id: plan.ownerUserId,
        session_id: plan.sessionId,
        title: plan.title,
        timezone: plan.timezone,
        starts_on: plan.startsOn,
        revision: plan.revision,
        created_at: plan.createdAt,
        updated_at: plan.updatedAt
      }).select("id").single();
      if (inserted.error) throw new Error(inserted.error.message);
      const slots = await service.from("grokbot_plan_slots").insert(plan.slots.map((slot) => ({
        id: slot.id,
        plan_id: plan.id,
        owner_user_id: plan.ownerUserId,
        position: slot.position,
        slot_date: slot.slotDate,
        title: slot.title,
        pathway_slug: slot.pathwaySlug,
        goal: slot.goal,
        reason: slot.reason,
        suggested_topic: slot.suggestedTopic,
        why_now: slot.whyNow,
        next_steps: slot.nextSteps,
        dependencies: slot.dependencies,
        status: slot.status,
        proposal_kind: slot.proposalKind
      })));
      if (slots.error) {
        await service.from("grokbot_plans").delete().eq("id", plan.id).eq("owner_user_id", plan.ownerUserId);
        throw new Error(slots.error.message);
      }
      const revision = plan.revisions[0];
      const history = await service.from("grokbot_plan_revisions").insert({
        plan_id: plan.id,
        owner_user_id: plan.ownerUserId,
        revision: plan.revision,
        reason: revision?.reason || "Created private plan",
        changes: revision?.changes || ["Created private plan"],
        created_at: plan.createdAt
      });
      if (history.error) throw new Error(history.error.message);
      return clonePlan(plan);
    },
    async listPlans(ownerUserId, limit) {
      const result = await service.from("grokbot_plans").select("id").eq("owner_user_id", ownerUserId).order("updated_at", { ascending: false }).limit(limit);
      if (result.error) throw new Error(result.error.message);
      const plans: PrivatePlan[] = [];
      for (const row of result.data ?? []) {
        const plan = await loadPlan(String((row as { id: string }).id));
        if (plan && plan.ownerUserId === ownerUserId) plans.push(plan);
      }
      return plans;
    },
    async getPlan(planId, ownerUserId) {
      const marker = await service.from("grokbot_plans").select("id, owner_user_id").eq("id", planId).maybeSingle();
      if (marker.error) throw new Error(marker.error.message);
      if (!marker.data) return { status: "missing" };
      if (String((marker.data as { owner_user_id: string }).owner_user_id) !== ownerUserId) return { status: "denied" };
      const plan = await loadPlan(planId);
      if (!plan) return { status: "missing" };
      return { status: "ok", plan };
    },
    async savePlan(ownerUserId, plan, expectedRevision) {
      const note = plan.revisions.at(-1);
      const saved = await service.rpc("grokbot_save_plan", {
        p_owner: ownerUserId,
        p_plan_id: plan.id,
        p_expected: expectedRevision,
        p_reason: note?.reason || "Saved",
        p_title: plan.title,
        p_timezone: plan.timezone,
        p_changes: note?.changes || [],
        p_slots: plan.slots
      });
      if (saved.error) throw new Error(saved.error.message);
      const payload = saved.data as { ok?: boolean; conflict?: boolean; currentRevision?: number; planId?: string; missing?: boolean; denied?: boolean };
      if (payload?.conflict) return { ok: false, conflict: true, currentRevision: Number(payload.currentRevision), planId: String(payload.planId || plan.id) };
      if (payload?.denied) return { ok: false, denied: true };
      if (!payload?.ok) return { ok: false, missing: true };
      const loaded = await loadPlan(plan.id);
      if (!loaded || loaded.ownerUserId !== ownerUserId) return { ok: false, missing: true };
      return { ok: true, plan: loaded } satisfies PlanWriteResult;
    },
    async saveScratch(note) {
      const existing = await service.from("grokbot_scratch").select("id, owner_user_id, created_at").eq("id", note.id).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data && String((existing.data as { owner_user_id: string }).owner_user_id) !== note.ownerUserId) {
        throw new Error("That scratch note belongs to another Studio user.");
      }
      const row = {
        id: note.id,
        owner_user_id: note.ownerUserId,
        session_id: note.sessionId,
        title: note.title,
        body: note.body.slice(0, 8000),
        kind: note.kind,
        linked_asset_ids: note.linkedAssetIds,
        canonical: false,
        created_at: existing.data ? String((existing.data as { created_at: string }).created_at) : note.createdAt,
        updated_at: note.updatedAt
      };
      const saved = existing.data
        ? await service.from("grokbot_scratch").update(row).eq("id", note.id).eq("owner_user_id", note.ownerUserId).select("*").single()
        : await service.from("grokbot_scratch").insert(row).select("*").single();
      if (saved.error) throw new Error(saved.error.message);
      const data = saved.data as Record<string, unknown>;
      return {
        id: String(data.id),
        ownerUserId: String(data.owner_user_id),
        sessionId: data.session_id ? String(data.session_id) : null,
        title: String(data.title),
        body: String(data.body),
        kind: data.kind as ScratchNote["kind"],
        linkedAssetIds: Array.isArray(data.linked_asset_ids) ? data.linked_asset_ids.map(String) : [],
        canonical: false,
        createdAt: String(data.created_at),
        updatedAt: String(data.updated_at)
      };
    },
    async listScratch(ownerUserId, sessionId) {
      let query = service.from("grokbot_scratch").select("*").eq("owner_user_id", ownerUserId).order("updated_at", { ascending: false }).limit(40);
      if (sessionId) query = query.eq("session_id", sessionId);
      const result = await query;
      if (result.error) throw new Error(result.error.message);
      return ((result.data ?? []) as Array<Record<string, unknown>>).map((note) => ({
        id: String(note.id),
        ownerUserId: String(note.owner_user_id),
        sessionId: note.session_id ? String(note.session_id) : null,
        title: String(note.title),
        body: String(note.body),
        kind: note.kind as ScratchNote["kind"],
        linkedAssetIds: Array.isArray(note.linked_asset_ids) ? note.linked_asset_ids.map(String) : [],
        canonical: false as const,
        createdAt: String(note.created_at),
        updatedAt: String(note.updated_at)
      }));
    },
    async linkAsset(input): Promise<AssetLinkResult> {
      const session = await access(input.sessionId, input.ownerUserId);
      if (session.status !== "ok") return { ok: false, denied: true };
      const asset = await service.from("studio_pathway_assets").select("id, created_by, pathway_slug, title, storage_bucket, storage_path, metadata, status, public_url").eq("id", input.assetId).maybeSingle();
      if (asset.error) throw new Error(asset.error.message);
      if (!asset.data) return { ok: false, missing: true };
      const row = asset.data as { id: string; created_by: string | null; pathway_slug: string; title: string; storage_bucket: string | null; storage_path: string | null; metadata: Record<string, unknown> | null; status: string };
      if (!row.created_by || row.created_by !== input.ownerUserId) return { ok: false, denied: true };
      const existing = await service.from("grokbot_session_assets").select("*").eq("session_id", input.sessionId).eq("asset_id", input.assetId).eq("owner_user_id", input.ownerUserId).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      const previewUrl = await signedPreview(service, row);
      const metadata = row.metadata ?? {};
      const filename = typeof metadata.filename === "string" ? metadata.filename : row.title;
      const mimeType = typeof metadata.mime === "string" ? metadata.mime : typeof metadata.mimeType === "string" ? metadata.mimeType : "application/octet-stream";
      const bytes = typeof metadata.bytes === "number" ? metadata.bytes : 0;
      if (existing.data) {
        const updated = await service.from("grokbot_session_assets").update({ use: input.use }).eq("id", (existing.data as { id: string }).id).eq("owner_user_id", input.ownerUserId).select("*").single();
        if (updated.error) throw new Error(updated.error.message);
        const link = updated.data as { id: string; created_at: string };
        return {
          ok: true,
          created: false,
          asset: {
            id: link.id,
            assetId: row.id,
            sessionId: input.sessionId,
            pathwaySlug: row.pathway_slug,
            filename,
            mimeType,
            bytes,
            use: input.use,
            previewUrl,
            storage: "private",
            createdAt: link.created_at
          }
        };
      }
      const inserted = await service.from("grokbot_session_assets").insert({
        id: randomUUID(),
        session_id: input.sessionId,
        owner_user_id: input.ownerUserId,
        asset_id: row.id,
        use: input.use
      }).select("*").single();
      if (inserted.error) throw new Error(inserted.error.message);
      const link = inserted.data as { id: string; created_at: string };
      return {
        ok: true,
        created: true,
        asset: {
          id: link.id,
          assetId: row.id,
          sessionId: input.sessionId,
          pathwaySlug: row.pathway_slug,
          filename,
          mimeType,
          bytes,
          use: input.use,
          previewUrl,
          storage: "private",
          createdAt: link.created_at
        }
      };
    },
    async listAssets(ownerUserId, sessionId) {
      const session = await access(sessionId, ownerUserId);
      if (session.status !== "ok" && session.status !== "archived") return [];
      const links = await service.from("grokbot_session_assets").select("*").eq("session_id", sessionId).eq("owner_user_id", ownerUserId).order("created_at", { ascending: false }).limit(40);
      if (links.error) throw new Error(links.error.message);
      const rows = (links.data ?? []) as Array<{ id: string; asset_id: string; use: "reference" | "draft_source"; created_at: string }>;
      const assets: LinkedAsset[] = [];
      for (const link of rows) {
        const asset = await service.from("studio_pathway_assets").select("id, created_by, pathway_slug, title, storage_bucket, storage_path, metadata").eq("id", link.asset_id).maybeSingle();
        if (asset.error || !asset.data) continue;
        const row = asset.data as { id: string; created_by: string | null; pathway_slug: string; title: string; storage_bucket: string | null; storage_path: string | null; metadata: Record<string, unknown> | null };
        if (row.created_by !== ownerUserId) continue;
        const metadata = row.metadata ?? {};
        assets.push({
          id: link.id,
          assetId: row.id,
          sessionId,
          pathwaySlug: row.pathway_slug,
          filename: typeof metadata.filename === "string" ? metadata.filename : row.title,
          mimeType: typeof metadata.mime === "string" ? metadata.mime : typeof metadata.mimeType === "string" ? metadata.mimeType : "application/octet-stream",
          bytes: typeof metadata.bytes === "number" ? metadata.bytes : 0,
          use: link.use,
          previewUrl: await signedPreview(service, row),
          storage: "private",
          createdAt: link.created_at
        });
      }
      return assets;
    }
  };

  return store;
}

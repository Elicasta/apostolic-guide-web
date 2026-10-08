import { hasStudioPermission } from "@/studio-permissions";
import { auditOperatorWrite } from "./audit";
import { interpretOperatorCommand } from "./interpret";
import { getOperatorAction } from "./registry";
import { getOperatorStore, openOperatorSession, sanitizeOperatorCommand } from "./session";
import type { StoredExecution } from "./store";
import type { OperatorActor, OperatorClassification, OperatorExecution, OperatorRunStatus, OperatorSessionContext } from "./types";
import { OperatorConflictError, PUBLIC_EFFECT_BLOCK_MESSAGE } from "./types";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,80}$/;

function replay(execution: StoredExecution, session: OperatorExecution["session"]): OperatorExecution {
  return {
    status: execution.record.status === "pending" ? "error" : execution.record.status,
    action: execution.record.action,
    classification: execution.record.classification,
    permission: execution.record.permission,
    approvalRequired: execution.record.approvalRequired,
    summary: execution.record.status === "pending" ? "That request is already running." : execution.record.summary,
    data: execution.data,
    record: execution.record,
    session
  };
}

async function sessionFor(execution: StoredExecution, actorUserId: string): Promise<OperatorExecution["session"]> {
  const access = await getOperatorStore().readSession(execution.sessionId, actorUserId);
  if (access.status === "ok" || access.status === "archived") {
    return { id: access.session.id, status: access.session.status, context: access.session.context, records: access.session.records };
  }
  return {
    id: execution.sessionId,
    status: "active",
    context: execution.record.context,
    records: [execution.record]
  };
}

function nextContext(action: string | null, current: OperatorSessionContext, data: Record<string, unknown>) {
  const context = { ...current };
  if (action === "pathway.inspect" && typeof data.slug === "string") context.pathwaySlug = data.slug;
  if ((action === "plan.create" || action === "plan.inspect" || action === "plan.duplicate" || action === "plan.update" || action === "plan.reorder") && typeof data.planId === "string") {
    context.planId = data.planId;
  }
  if (action === "asset.link" && typeof data.pathwaySlug === "string") context.pathwaySlug = data.pathwaySlug;
  return context;
}

export async function executeOperatorCommand(input: {
  command?: string | null;
  action?: string | null;
  input?: unknown;
  actor: OperatorActor;
  sessionId?: string | null;
  context?: Partial<OperatorSessionContext> | null;
  requestId?: string | null;
}): Promise<OperatorExecution> {
  const command = sanitizeOperatorCommand(input.command || input.action || "");
  if (input.requestId && !REQUEST_ID.test(input.requestId)) {
    throw new Error("Request ids must be 8 to 80 letters, numbers, underscores, or hyphens.");
  }

  if (input.requestId) {
    const existing = await getOperatorStore().findRun(input.actor.userId, input.requestId);
    if (existing && existing.record.status !== "pending") {
      return replay(existing, await sessionFor(existing, input.actor.userId));
    }
  }

  const session = await openOperatorSession({
    actorUserId: input.actor.userId,
    sessionId: input.sessionId,
    context: input.context
  });

  const interpreted = input.action
    ? { kind: "action" as const, action: input.action, input: (input.input ?? {}) as Record<string, unknown> }
    : interpretOperatorCommand(command);

  const store = getOperatorStore();
  let runId: string | null = null;
  if (input.requestId) {
    const claim = await store.claimRun({
      ownerUserId: input.actor.userId,
      sessionId: session.id,
      requestId: input.requestId,
      command,
      context: session.context
    });
    if (claim.state === "replay") return replay(claim.execution, await sessionFor(claim.execution, input.actor.userId));
    if (claim.state === "pending") {
      return {
        status: "error",
        action: null,
        classification: null,
        permission: null,
        approvalRequired: false,
        summary: "That request is already running.",
        data: {},
        record: {
          id: input.requestId,
          sessionId: session.id,
          actorUserId: input.actor.userId,
          requestId: input.requestId,
          command,
          action: null,
          classification: null,
          permission: null,
          approvalRequired: false,
          status: "pending",
          summary: "That request is already running.",
          createdAt: new Date().toISOString(),
          context: session.context
        },
        session: { id: session.id, status: session.status, context: session.context, records: session.records }
      };
    }
    runId = claim.runId;
  }

  const finish = async (result: {
    status: OperatorRunStatus;
    action: string | null;
    classification: OperatorClassification | null;
    permission: OperatorExecution["permission"];
    approvalRequired: boolean;
    summary: string;
    data: Record<string, unknown>;
    context?: OperatorSessionContext;
  }): Promise<OperatorExecution> => {
    const context = result.context ?? session.context;
    const record = runId
      ? await store.completeRun({
        runId,
        ownerUserId: input.actor.userId,
        action: result.action,
        classification: result.classification,
        permission: result.permission,
        approvalRequired: result.approvalRequired,
        status: result.status === "pending" ? "error" : result.status,
        summary: result.summary,
        context,
        data: result.data
      })
      : await store.appendRun({
        ownerUserId: input.actor.userId,
        sessionId: session.id,
        requestId: input.requestId ?? null,
        command,
        action: result.action,
        classification: result.classification,
        permission: result.permission,
        approvalRequired: result.approvalRequired,
        status: result.status === "pending" ? "error" : result.status,
        summary: result.summary,
        context,
        data: result.data
      });
    const stored = await store.readSession(session.id, input.actor.userId);
    const visible = stored.status === "ok" || stored.status === "archived" ? stored.session : session;
    return {
      status: result.status === "pending" ? "error" : result.status,
      action: result.action,
      classification: result.classification,
      permission: result.permission,
      approvalRequired: result.approvalRequired,
      summary: result.summary,
      data: result.data,
      record,
      session: { id: visible.id, status: visible.status, context: visible.context, records: visible.records }
    };
  };

  if (!command) {
    return finish({
      status: "blocked",
      action: null,
      classification: null,
      permission: null,
      approvalRequired: false,
      summary: "Enter a command.",
      data: {}
    });
  }

  if (interpreted.kind === "refused") {
    return finish({
      status: "blocked",
      action: null,
      classification: null,
      permission: null,
      approvalRequired: false,
      summary: interpreted.summary,
      data: {}
    });
  }

  const action = getOperatorAction(interpreted.action);
  if (!action) {
    return finish({
      status: "error",
      action: interpreted.action,
      classification: null,
      permission: null,
      approvalRequired: false,
      summary: "That action is not registered.",
      data: {}
    });
  }

  if (!hasStudioPermission(input.actor.role, action.permission)) {
    return finish({
      status: "blocked",
      action: action.name,
      classification: action.classification,
      permission: action.permission,
      approvalRequired: false,
      summary: "Your Studio role cannot run that action.",
      data: {}
    });
  }

  if (action.classification === "public_effect") {
    return finish({
      status: "blocked",
      action: action.name,
      classification: action.classification,
      permission: action.permission,
      approvalRequired: true,
      summary: PUBLIC_EFFECT_BLOCK_MESSAGE,
      data: { externalEffect: false }
    });
  }

  const parsed = action.inputSchema.safeParse(interpreted.input);
  if (!parsed.success) {
    return finish({
      status: "error",
      action: action.name,
      classification: action.classification,
      permission: action.permission,
      approvalRequired: false,
      summary: "That command did not include a valid input.",
      data: {}
    });
  }

  if (action.classification === "private_write" && !input.requestId) {
    return finish({
      status: "error",
      action: action.name,
      classification: action.classification,
      permission: action.permission,
      approvalRequired: false,
      summary: "Private changes need a request id so a retry cannot apply twice.",
      data: {}
    });
  }

  try {
    const result = await action.handler(parsed.data, input.actor, { sessionId: session.id, store });
    const context = nextContext(action.name, session.context, result.data);
    const finished = await finish({
      status: "ok",
      action: action.name,
      classification: action.classification,
      permission: action.permission,
      approvalRequired: false,
      summary: result.summary,
      data: result.data,
      context
    });
    if (action.classification === "private_write") {
      const resourceId = typeof result.data.planId === "string"
        ? result.data.planId
        : typeof result.data.assetId === "string"
          ? result.data.assetId
          : typeof result.data.scratchId === "string"
            ? result.data.scratchId
            : session.id;
      await auditOperatorWrite({
        actorUserId: input.actor.userId,
        action: action.name,
        resourceId,
        metadata: {
          sessionId: session.id,
          requestId: input.requestId ?? null,
          status: "ok"
        }
      });
    }
    return finished;
  } catch (error) {
    if (error instanceof OperatorConflictError) {
      return finish({
        status: "error",
        action: action.name,
        classification: action.classification,
        permission: action.permission,
        approvalRequired: false,
        summary: error.message,
        data: { conflict: true, planId: error.planId, currentRevision: error.currentRevision, overwritten: false, published: false }
      });
    }
    const named = error instanceof Error ? error.name : "";
    if (named === "OperatorSessionDenied" || named === "OperatorAssetDenied") {
      return finish({
        status: "blocked",
        action: action.name,
        classification: action.classification,
        permission: action.permission,
        approvalRequired: false,
        summary: error instanceof Error ? error.message : "That record belongs to another Studio user.",
        data: {}
      });
    }
    const summary = error instanceof Error ? error.message : "The action failed.";
    return finish({
      status: "error",
      action: action.name,
      classification: action.classification,
      permission: action.permission,
      approvalRequired: false,
      summary: summary.slice(0, 300),
      data: {}
    });
  }
}

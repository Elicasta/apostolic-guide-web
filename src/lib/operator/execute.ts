import { hasStudioPermission } from "@/studio-permissions";
import { interpretOperatorCommand } from "./interpret";
import { getOperatorAction } from "./registry";
import { appendOperatorRecord, openOperatorSession, readOperatorSession, sanitizeOperatorCommand } from "./session";
import type { OperatorActor, OperatorExecution, OperatorSessionContext } from "./types";
import { PUBLIC_EFFECT_BLOCK_MESSAGE } from "./types";

function finish(input: Omit<OperatorExecution, "record" | "session"> & {
  actor: OperatorActor;
  sessionId: string;
  command: string;
  context?: OperatorSessionContext;
}): OperatorExecution {
  const record = appendOperatorRecord(input.sessionId, input.actor.userId, {
    command: input.command,
    action: input.action,
    classification: input.classification,
    status: input.status,
    summary: input.summary,
    context: input.context
  });
  if (!record) throw new Error("Grokbot could not record that command.");
  const stored = readOperatorSession(input.sessionId, input.actor.userId);
  return {
    status: input.status,
    action: input.action,
    classification: input.classification,
    permission: input.permission,
    approvalRequired: input.approvalRequired,
    summary: input.summary,
    data: input.data,
    record,
    session: stored ?? {
      id: input.sessionId,
      context: record.context,
      records: [record]
    }
  };
}

export async function executeOperatorCommand(input: {
  command: string;
  actor: OperatorActor;
  sessionId?: string | null;
  context?: Partial<OperatorSessionContext> | null;
}): Promise<OperatorExecution> {
  const command = sanitizeOperatorCommand(input.command);
  const session = openOperatorSession({
    actorUserId: input.actor.userId,
    sessionId: input.sessionId,
    context: input.context
  });
  const interpreted = interpretOperatorCommand(command);
  if (interpreted.kind === "refused") {
    return finish({
      actor: input.actor,
      sessionId: session.id,
      command,
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
      actor: input.actor,
      sessionId: session.id,
      command,
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
      actor: input.actor,
      sessionId: session.id,
      command,
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
      actor: input.actor,
      sessionId: session.id,
      command,
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
      actor: input.actor,
      sessionId: session.id,
      command,
      status: "error",
      action: action.name,
      classification: action.classification,
      permission: action.permission,
      approvalRequired: false,
      summary: "That command did not include a valid input.",
      data: {}
    });
  }

  try {
    const result = await action.handler(parsed.data, input.actor);
    const context = action.name === "pathway.inspect" && typeof result.data.slug === "string"
      ? { ...session.context, pathwaySlug: result.data.slug }
      : session.context;
    return finish({
      actor: input.actor,
      sessionId: session.id,
      command,
      context,
      status: "ok",
      action: action.name,
      classification: action.classification,
      permission: action.permission,
      approvalRequired: false,
      summary: result.summary,
      data: result.data
    });
  } catch (error) {
    const summary = error instanceof Error ? error.message : "The action failed.";
    return finish({
      actor: input.actor,
      sessionId: session.id,
      command,
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

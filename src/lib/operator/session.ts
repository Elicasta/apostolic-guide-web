import { createMemoryOperatorStore, type MemoryOperatorStore } from "./memory-store";
import { redactOperatorText } from "./redact";
import type { OperatorStore } from "./store";
import { createSupabaseOperatorStore } from "./supabase-store";
import type { OperatorSessionContext } from "./types";
import { OperatorCommandError } from "./types";

/**
 * Production source of truth is the Supabase store.
 * Process memory is installed only by tests. A missing service configuration
 * refuses the command instead of pretending the transcript was saved.
 */
let testStore: MemoryOperatorStore | null = null;

export function resetOperatorSessionsForTests() {
  testStore = createMemoryOperatorStore();
  return testStore;
}

export function clearOperatorStoreForTests() {
  testStore = null;
}

export function getOperatorStore(): OperatorStore {
  if (testStore) return testStore;
  const durable = createSupabaseOperatorStore();
  if (!durable) {
    throw new OperatorCommandError(
      "OperatorPersistenceUnavailable",
      "Grokbot persistence is not configured. Sessions are not stored in process memory."
    );
  }
  return durable;
}

export function emptyOperatorContext(): OperatorSessionContext {
  return { pathwaySlug: null, projectId: null, planId: null };
}

export function sanitizeOperatorCommand(command: string) {
  return redactOperatorText(command, 500);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function openOperatorSession(input: {
  actorUserId: string;
  sessionId?: string | null;
  context?: Partial<OperatorSessionContext> | null;
}) {
  const store = getOperatorStore();
  if (input.sessionId) {
    if (!UUID.test(input.sessionId)) {
      throw new OperatorCommandError("OperatorSessionInvalid", "That Grokbot session id is not valid.");
    }
    const existing = await store.readSession(input.sessionId, input.actorUserId);
    if (existing.status === "missing") {
      throw new OperatorCommandError("OperatorSessionMissing", "That Grokbot session was not found. A new session was not created.");
    }
    if (existing.status === "denied") {
      throw new OperatorCommandError("OperatorSessionDenied", "That Grokbot session belongs to another Studio user.");
    }
    if (existing.status === "archived") {
      throw new OperatorCommandError("OperatorSessionArchived", "That Grokbot session is archived.");
    }
    const context = { ...existing.session.context };
    if (input.context?.pathwaySlug) context.pathwaySlug = input.context.pathwaySlug;
    if (input.context?.projectId) context.projectId = input.context.projectId;
    if (input.context?.planId) context.planId = input.context.planId;
    if (
      context.pathwaySlug !== existing.session.context.pathwaySlug
      || context.projectId !== existing.session.context.projectId
      || context.planId !== existing.session.context.planId
    ) {
      await store.touchContext(existing.session.id, input.actorUserId, context);
    }
    return { ...existing.session, context };
  }
  return store.createSession({
    ownerUserId: input.actorUserId,
    context: input.context ?? undefined
  });
}

export async function readOperatorSession(sessionId: string, actorUserId: string) {
  const access = await getOperatorStore().readSession(sessionId, actorUserId);
  if (access.status === "ok" || access.status === "archived") return access;
  return access;
}

export async function listOperatorSessions(actorUserId: string, limit = 20) {
  return getOperatorStore().listSessions(actorUserId, Math.min(Math.max(limit, 1), 50));
}

import { randomUUID } from "node:crypto";
import type { OperatorRunRecord, OperatorSessionContext } from "./types";

/**
 * Process-memory session log.
 * A database table was not added: this batch must not apply a production migration,
 * and the existing audit log is for privileged Studio mutations rather than a command transcript.
 * Records survive only for the life of this server process. The workbench also keeps the
 * returned transcript in the browser for the open tab.
 */
const MAX_SESSIONS = 200;
const MAX_RECORDS = 80;

type SessionState = {
  id: string;
  actorUserId: string;
  context: OperatorSessionContext;
  records: OperatorRunRecord[];
  updatedAt: number;
};

const sessions = new Map<string, SessionState>();

function emptyContext(): OperatorSessionContext {
  return { pathwaySlug: null, projectId: null };
}

export function resetOperatorSessionsForTests() {
  sessions.clear();
}

export function sanitizeOperatorCommand(command: string) {
  return command
    .replace(/\b(sk-|sbp_|eyJ|xox[baprs]-)[A-Za-z0-9._-]{6,}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function touch(session: SessionState) {
  session.updatedAt = Date.now();
  sessions.delete(session.id);
  sessions.set(session.id, session);
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (!oldest) break;
    sessions.delete(oldest);
  }
}

export function openOperatorSession(input: {
  actorUserId: string;
  sessionId?: string | null;
  context?: Partial<OperatorSessionContext> | null;
}) {
  const requested = input.sessionId && /^[0-9a-f-]{36}$/i.test(input.sessionId) ? input.sessionId : null;
  const existing = requested ? sessions.get(requested) : undefined;
  if (existing && existing.actorUserId !== input.actorUserId) {
    const error = new Error("That Grokbot session belongs to another Studio user.");
    error.name = "OperatorSessionDenied";
    throw error;
  }
  if (existing) {
    if (input.context?.pathwaySlug) existing.context.pathwaySlug = input.context.pathwaySlug;
    if (input.context?.projectId) existing.context.projectId = input.context.projectId;
    touch(existing);
    return existing;
  }
  const created: SessionState = {
    id: requested ?? randomUUID(),
    actorUserId: input.actorUserId,
    context: {
      pathwaySlug: input.context?.pathwaySlug ?? null,
      projectId: input.context?.projectId ?? null
    },
    records: [],
    updatedAt: Date.now()
  };
  touch(created);
  return created;
}

export function appendOperatorRecord(sessionId: string, actorUserId: string, record: Omit<OperatorRunRecord, "id" | "sessionId" | "actorUserId" | "createdAt" | "context"> & { context?: OperatorSessionContext }) {
  const session = sessions.get(sessionId);
  if (!session || session.actorUserId !== actorUserId) return null;
  if (record.context) session.context = { ...record.context };
  const stored: OperatorRunRecord = {
    id: randomUUID(),
    sessionId,
    actorUserId,
    command: sanitizeOperatorCommand(record.command),
    action: record.action,
    classification: record.classification,
    status: record.status,
    summary: record.summary.slice(0, 500),
    createdAt: new Date().toISOString(),
    context: { ...session.context }
  };
  session.records.push(stored);
  if (session.records.length > MAX_RECORDS) session.records.splice(0, session.records.length - MAX_RECORDS);
  touch(session);
  return stored;
}

export function readOperatorSession(sessionId: string, actorUserId: string) {
  const session = sessions.get(sessionId);
  if (!session || session.actorUserId !== actorUserId) return null;
  return {
    id: session.id,
    context: { ...session.context },
    records: session.records.map((record) => ({ ...record, context: { ...record.context } }))
  };
}

export function emptyOperatorContext() {
  return emptyContext();
}

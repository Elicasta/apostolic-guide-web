import "server-only";
import { createServiceClient } from "./supabase";

export type SolAgentMessage = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  kind: "text" | "tool_call" | "tool_result" | "approval" | "status";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SolAgentApproval = {
  id: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  summary: string;
  risk: "safe_draft" | "review_required" | "external_effect";
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  resolvedAt: string | null;
};

export type SolAgentThread = {
  id: string;
  currentPathname: string;
  messages: SolAgentMessage[];
  approvals: SolAgentApproval[];
};

type Service = NonNullable<ReturnType<typeof createServiceClient>>;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function messageFromRow(row: Record<string, unknown>): SolAgentMessage {
  return {
    id: String(row.id),
    role: String(row.role) as SolAgentMessage["role"],
    kind: String(row.kind) as SolAgentMessage["kind"],
    content: String(row.content ?? ""),
    metadata: record(row.metadata),
    createdAt: String(row.created_at)
  };
}

function approvalFromRow(row: Record<string, unknown>): SolAgentApproval {
  return {
    id: String(row.id),
    toolName: String(row.tool_name),
    toolArguments: record(row.tool_arguments),
    summary: String(row.summary),
    risk: String(row.risk) as SolAgentApproval["risk"],
    status: String(row.status) as SolAgentApproval["status"],
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null
  };
}

async function ensureThread(service: Service, userId: string, pathname = "/admin") {
  const existing = await service.from("sol_agent_threads")
    .select("id,current_pathname")
    .eq("workspace_key", "apostolic-guide")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (pathname && pathname !== existing.data.current_pathname) {
      const updated = await service.from("sol_agent_threads").update({ current_pathname: pathname }).eq("id", existing.data.id);
      if (updated.error) throw updated.error;
    }
    return { id: String(existing.data.id), currentPathname: pathname || String(existing.data.current_pathname || "/admin") };
  }
  const created = await service.from("sol_agent_threads").insert({
    workspace_key: "apostolic-guide",
    user_id: userId,
    current_pathname: pathname || "/admin"
  }).select("id,current_pathname").single();
  if (created.error) throw created.error;
  return { id: String(created.data.id), currentPathname: String(created.data.current_pathname || "/admin") };
}

export async function getSolAgentThread(userId: string, pathname = "/admin", limit = 80): Promise<SolAgentThread | null> {
  const service = createServiceClient();
  if (!service) return null;
  try {
    const thread = await ensureThread(service, userId, pathname);
    const [messages, approvals] = await Promise.all([
      service.from("sol_agent_messages").select("*").eq("thread_id", thread.id).order("created_at", { ascending: false }).limit(Math.max(10, Math.min(120, limit))),
      service.from("sol_agent_approvals").select("*").eq("thread_id", thread.id).eq("status", "pending").order("created_at", { ascending: false }).limit(12)
    ]);
    if (messages.error) throw messages.error;
    if (approvals.error) throw approvals.error;
    return {
      id: thread.id,
      currentPathname: thread.currentPathname,
      messages: (messages.data ?? []).reverse().map((row) => messageFromRow(row as Record<string, unknown>)),
      approvals: (approvals.data ?? []).map((row) => approvalFromRow(row as Record<string, unknown>))
    };
  } catch (error) {
    console.error("Sol agent memory load failed", error);
    return null;
  }
}

export async function appendSolAgentMessage(input: {
  threadId: string;
  role: SolAgentMessage["role"];
  kind?: SolAgentMessage["kind"];
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const service = createServiceClient();
  if (!service) return null;
  const inserted = await service.from("sol_agent_messages").insert({
    thread_id: input.threadId,
    role: input.role,
    kind: input.kind ?? "text",
    content: input.content.slice(0, 12_000),
    metadata: input.metadata ?? {}
  }).select("*").single();
  if (inserted.error) throw inserted.error;
  return messageFromRow(inserted.data as Record<string, unknown>);
}

export async function createSolAgentApproval(input: {
  threadId: string;
  requestedBy: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  summary: string;
  risk: SolAgentApproval["risk"];
}) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const existing = await service.from("sol_agent_approvals")
    .select("*")
    .eq("thread_id", input.threadId)
    .eq("tool_name", input.toolName)
    .eq("status", "pending")
    .contains("tool_arguments", input.toolArguments)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return approvalFromRow(existing.data as Record<string, unknown>);

  const inserted = await service.from("sol_agent_approvals").insert({
    thread_id: input.threadId,
    requested_by: input.requestedBy,
    tool_name: input.toolName,
    tool_arguments: input.toolArguments,
    summary: input.summary.slice(0, 800),
    risk: input.risk,
    status: "pending"
  }).select("*").single();
  if (inserted.error) throw inserted.error;
  const approval = approvalFromRow(inserted.data as Record<string, unknown>);
  await appendSolAgentMessage({
    threadId: input.threadId,
    role: "assistant",
    kind: "approval",
    content: input.summary,
    metadata: { approvalId: approval.id, toolName: input.toolName, risk: input.risk }
  });
  return approval;
}

export async function getSolAgentApproval(approvalId: string, userId: string) {
  const service = createServiceClient();
  if (!service) return null;
  const result = await service.from("sol_agent_approvals")
    .select("*,sol_agent_threads!inner(user_id)")
    .eq("id", approvalId)
    .eq("sol_agent_threads.user_id", userId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? approvalFromRow(result.data as Record<string, unknown>) : null;
}

export async function resolveSolAgentApproval(input: {
  approvalId: string;
  userId: string;
  decision: "approved" | "rejected";
}) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const owned = await service.from("sol_agent_approvals")
    .select("id,thread_id,status,sol_agent_threads!inner(user_id)")
    .eq("id", input.approvalId)
    .eq("sol_agent_threads.user_id", input.userId)
    .maybeSingle();
  if (owned.error) throw owned.error;
  if (!owned.data) throw new Error("Approval not found.");
  if (owned.data.status !== "pending") return String(owned.data.thread_id);
  const now = new Date().toISOString();
  const updated = await service.from("sol_agent_approvals").update({
    status: input.decision,
    resolved_at: now,
    resolved_by: input.userId
  }).eq("id", input.approvalId).eq("status", "pending");
  if (updated.error) throw updated.error;
  return String(owned.data.thread_id);
}

import { createServiceClient } from "./supabase";

export type StudioAuditEvent = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function recordStudioAudit(input: {
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const service = createServiceClient();
  if (!service) return false;
  try {
    const { error } = await service.rpc("record_studio_audit", {
      p_actor_user_id: input.actorUserId,
      p_action: input.action,
      p_resource_type: input.resourceType,
      p_resource_id: input.resourceId ?? null,
      p_metadata: input.metadata ?? {}
    });
    if (error) {
      console.error("Studio audit write failed", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Studio audit write failed", error);
    return false;
  }
}

export async function listStudioAudit(input?: {
  limit?: number;
  offset?: number;
  resourceType?: string | null;
  action?: string | null;
}) {
  const service = createServiceClient();
  if (!service) return [] as StudioAuditEvent[];
  try {
    const { data, error } = await service.rpc("list_studio_audit", {
      p_limit: Math.min(Math.max(input?.limit ?? 100, 1), 200),
      p_offset: Math.max(input?.offset ?? 0, 0),
      p_resource_type: input?.resourceType || null,
      p_action: input?.action || null
    });
    if (error) throw error;
    return (data ?? []) as StudioAuditEvent[];
  } catch (error) {
    console.error("Studio audit read failed", error);
    return [] as StudioAuditEvent[];
  }
}

export function studioAuditActionLabel(action: string) {
  return action
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .join(" · ")
    .replace(/^./, (value) => value.toUpperCase());
}

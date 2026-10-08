import { recordStudioAudit } from "@/studio-audit";

export const privateWriteAuditCalls = { count: 0 };

export function resetPrivateWriteAuditCalls() {
  privateWriteAuditCalls.count = 0;
}

export async function auditOperatorWrite(input: {
  actorUserId: string;
  action: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  privateWriteAuditCalls.count += 1;
  const resourceId = input.resourceId && /^[0-9a-f-]{36}$/i.test(input.resourceId) ? input.resourceId : null;
  await recordStudioAudit({
    actorUserId: input.actorUserId,
    action: input.action,
    resourceType: "grokbot",
    resourceId,
    metadata: input.metadata ?? {}
  });
}

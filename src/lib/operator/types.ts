import type { ZodType } from "zod";
import type { StudioPermission, StudioRole } from "@/studio-permissions";
import type { OperatorStore } from "./store";

export type OperatorClassification = "read" | "private_write" | "public_effect";
export type OperatorRunStatus = "ok" | "error" | "blocked" | "pending";

export type OperatorActor = {
  userId: string;
  role: StudioRole;
};

export type OperatorSessionContext = {
  pathwaySlug: string | null;
  projectId: string | null;
  planId: string | null;
};

export type OperatorRuntime = {
  sessionId: string;
  store: OperatorStore;
};

export type OperatorActionResult = {
  summary: string;
  data: Record<string, unknown>;
};

export type OperatorActionDefinition<TInput = unknown> = {
  name: string;
  description: string;
  inputSchema: ZodType<TInput>;
  permission: StudioPermission;
  classification: OperatorClassification;
  handler: (input: TInput, actor: OperatorActor, runtime: OperatorRuntime) => Promise<OperatorActionResult>;
};

export type OperatorRunRecord = {
  id: string;
  sessionId: string;
  actorUserId: string;
  requestId: string | null;
  command: string;
  action: string | null;
  classification: OperatorClassification | null;
  permission: StudioPermission | null;
  approvalRequired: boolean;
  status: OperatorRunStatus;
  summary: string;
  createdAt: string;
  context: OperatorSessionContext;
};

export type OperatorExecution = {
  status: OperatorRunStatus;
  action: string | null;
  classification: OperatorClassification | null;
  permission: StudioPermission | null;
  approvalRequired: boolean;
  summary: string;
  data: Record<string, unknown>;
  record: OperatorRunRecord;
  session: {
    id: string;
    status: "active" | "archived";
    context: OperatorSessionContext;
    records: OperatorRunRecord[];
  };
};

export const PUBLIC_EFFECT_BLOCK_MESSAGE = "Public effects are blocked until the Approval Inbox exists. Nothing was published, sent, activated, or enrolled.";

export class OperatorCommandError extends Error {
  constructor(name: "OperatorSessionDenied" | "OperatorSessionMissing" | "OperatorSessionInvalid" | "OperatorSessionArchived" | "OperatorPersistenceUnavailable" | "OperatorConflict" | "OperatorAssetDenied" | "OperatorAssetMissing", message: string) {
    super(message);
    this.name = name;
  }
}

export class OperatorConflictError extends OperatorCommandError {
  planId: string;
  currentRevision: number;
  constructor(planId: string, currentRevision: number) {
    super("OperatorConflict", "This plan changed since you opened it. Reload the plan before saving. Nothing was overwritten.");
    this.planId = planId;
    this.currentRevision = currentRevision;
  }
}

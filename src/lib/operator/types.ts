import type { ZodType } from "zod";
import type { StudioPermission, StudioRole } from "@/studio-permissions";

export type OperatorClassification = "read" | "private_write" | "public_effect";
export type OperatorRunStatus = "ok" | "error" | "blocked";

export type OperatorActor = {
  userId: string;
  role: StudioRole;
};

export type OperatorSessionContext = {
  pathwaySlug: string | null;
  projectId: string | null;
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
  handler: (input: TInput, actor: OperatorActor) => Promise<OperatorActionResult>;
};

export type OperatorRunRecord = {
  id: string;
  sessionId: string;
  actorUserId: string;
  command: string;
  action: string | null;
  classification: OperatorClassification | null;
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
    context: OperatorSessionContext;
    records: OperatorRunRecord[];
  };
};

export const PUBLIC_EFFECT_BLOCK_MESSAGE = "Public effects are blocked until the Approval Inbox exists. Nothing was published, sent, activated, or enrolled.";

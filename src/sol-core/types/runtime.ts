export type SolEnvironment = "local" | "development" | "preview" | "production";
export type SolMode = "watch" | "assist" | "trusted";
export type SolPermission = "read" | "write" | "execute" | "publish" | "deploy" | "delete" | "financial" | "security";

export type SolTaskStatus =
  | "pending"
  | "blocked"
  | "queued"
  | "running"
  | "waiting"
  | "waiting_for_approval"
  | "retry_scheduled"
  | "verifying"
  | "repairing"
  | "completed"
  | "failed"
  | "stalled"
  | "cancelled"
  | "skipped";

export type SolRunStatus =
  | "created"
  | "planning"
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "retrying"
  | "repairing"
  | "completed"
  | "failed"
  | "stalled"
  | "cancelled"
  | "superseded";

export type SolApprovalType = "review" | "publish" | "deploy" | "delete" | "financial" | "security";
export type SolApprovalStatus = "pending" | "approved" | "rejected" | "changes_requested" | "expired";
export type SolArtifactStorageType = "database" | "file" | "url" | "external";
export type SolVerificationStatus = "pending" | "passed" | "failed";

export interface SolCondition {
  task: string;
  path?: string;
  operator: "equals" | "not_equals" | "exists" | "truthy" | "falsy";
  value?: unknown;
}

export interface SolTaskDefinition {
  id: string;
  name: string;
  tool?: string;
  workflow?: string;
  input: Record<string, unknown>;
  dependsOn: string[];
  condition?: SolCondition;
  foreach?: { sourceTask: string; outputPath: string };
  permission: SolPermission;
  retryPolicy: {
    maxAttempts: number;
    strategy: "fixed" | "exponential";
    baseDelayMs: number;
    maxDelayMs: number;
  };
  timeoutMs: number;
  idempotency?: { required: boolean; key: string };
  approval?: { required: boolean; type: SolApprovalType };
  verifier?: string;
}

export interface SolPlan {
  id: string;
  version: number;
  goal: string;
  workflow?: { key: string; version: number };
  environment: SolEnvironment;
  tasks: SolTaskDefinition[];
}

export interface SolArtifactRef {
  id: string;
  type: string;
  title?: string;
  route?: string;
}

export interface SolArtifact extends SolArtifactRef {
  runId: string;
  taskId: string;
  title: string;
  storageType: SolArtifactStorageType;
  location: string;
  metadata: Record<string, unknown>;
  verificationStatus: SolVerificationStatus;
  createdAt: string;
}

export interface SolReview {
  id: string;
  runId: string;
  taskId: string;
  status: SolApprovalStatus;
  artifact: {
    type: string;
    id: string;
    title?: string;
    route: string;
  };
  requestedAt: string;
  resolvedAt?: string;
  decision?: {
    action: "approve" | "changes_requested" | "reject";
    note?: string;
    userId: string;
  };
}

export interface SolRuntimeEvent {
  eventType: string;
  runId: string;
  taskId?: string | null;
  message: string;
  details?: Record<string, unknown>;
  createdAt?: string;
}

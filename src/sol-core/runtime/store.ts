import type {
  SolApprovalType,
  SolArtifactStorageType,
  SolEnvironment,
  SolMode,
  SolPermission,
  SolRunStatus,
  SolTaskStatus,
  SolVerificationStatus
} from "../types/runtime";

export type SolRuntimeRunRecord = {
  id: string;
  goal: string;
  workflowKey: string | null;
  workflowVersion: number | null;
  environment: SolEnvironment;
  mode: SolMode;
  status: SolRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
};

export type SolRuntimeTaskRecord = {
  id: string;
  runId: string;
  taskKey: string;
  name: string;
  toolName: string | null;
  workflowName: string | null;
  status: SolTaskStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  dependsOn: string[];
  condition: Record<string, unknown> | null;
  foreach: Record<string, unknown> | null;
  permission: SolPermission;
  environment: SolEnvironment;
  idempotencyKey: string | null;
  approvalType: SolApprovalType | null;
  verifierName: string | null;
  retryStrategy: "fixed" | "exponential";
  attemptCount: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  timeoutMs: number;
  workerId: string | null;
};

export type SolRuntimeAttemptRecord = {
  id: string;
  attemptNumber: number;
};

export type SolRuntimeArtifactInput = {
  runId: string;
  taskId: string;
  type: string;
  title: string;
  storageType: SolArtifactStorageType;
  location: string;
  metadata?: Record<string, unknown>;
  verificationStatus?: SolVerificationStatus;
};

export interface SolRuntimeStore {
  claimTasks(workerId: string, limit: number, leaseSeconds: number): Promise<SolRuntimeTaskRecord[]>;
  getRun(runId: string): Promise<SolRuntimeRunRecord | null>;
  getTasks(runId: string): Promise<SolRuntimeTaskRecord[]>;
  startAttempt(task: SolRuntimeTaskRecord, workerId: string): Promise<SolRuntimeAttemptRecord>;
  completeAttempt(attemptId: string, output: Record<string, unknown>): Promise<void>;
  failAttempt(attemptId: string, error: { code: string; message: string }): Promise<void>;
  emit(input: { runId: string; taskId?: string | null; eventType: string; message: string; details?: Record<string, unknown> }): Promise<void>;
  heartbeat(taskId: string, workerId: string, leaseSeconds: number): Promise<boolean>;
  completeTask(taskId: string, workerId: string, output: Record<string, unknown>): Promise<boolean>;
  skipTask(taskId: string, workerId: string, reason: string): Promise<boolean>;
  scheduleRetry(taskId: string, workerId: string, input: { nextRetryAt: string; errorCode: string; errorMessage: string }): Promise<boolean>;
  failTask(taskId: string, workerId: string, input: { status: "failed" | "stalled"; errorCode: string; errorMessage: string }): Promise<boolean>;
  waitForApproval(task: SolRuntimeTaskRecord, input: { type: SolApprovalType; requestedAction: string }): Promise<string>;
  recordArtifact(input: SolRuntimeArtifactInput): Promise<string>;
  recordObservation(input: { runId: string; taskId?: string | null; source: string; kind: string; payload: Record<string, unknown> }): Promise<string>;
  unblockTasks(runId: string): Promise<number>;
  updateRunStatus(runId: string, status: SolRunStatus, output?: Record<string, unknown>): Promise<void>;
  releaseExpiredLeases(): Promise<{ recovered: number; stalled: number }>;
}
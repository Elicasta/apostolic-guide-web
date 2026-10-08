import type { StudioPermission } from "@/studio-permissions";
import type { PrivatePlan } from "./plan-model";
import type { OperatorClassification, OperatorRunRecord, OperatorRunStatus, OperatorSessionContext } from "./types";

export type SessionSummary = {
  id: string;
  workspaceKey: string;
  context: OperatorSessionContext;
  status: "active" | "archived";
  updatedAt: string;
  runCount: number;
};

export type OperatorSessionView = {
  id: string;
  ownerUserId: string;
  workspaceKey: string;
  context: OperatorSessionContext;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  records: OperatorRunRecord[];
};

export type SessionAccess =
  | { status: "ok"; session: OperatorSessionView }
  | { status: "missing" }
  | { status: "denied" }
  | { status: "archived"; session: OperatorSessionView };

export type StoredExecution = {
  record: OperatorRunRecord;
  data: Record<string, unknown>;
  sessionId: string;
};

export type ScratchNote = {
  id: string;
  ownerUserId: string;
  sessionId: string | null;
  title: string;
  body: string;
  kind: "text" | "hook" | "outline";
  linkedAssetIds: string[];
  canonical: false;
  createdAt: string;
  updatedAt: string;
};

export type LinkedAsset = {
  id: string;
  assetId: string;
  sessionId: string;
  pathwaySlug: string | null;
  filename: string;
  mimeType: string;
  bytes: number;
  use: "reference" | "draft_source";
  previewUrl: string | null;
  storage: "private";
  createdAt: string;
};

export type OwnedAssetRecord = {
  id: string;
  ownerUserId: string | null;
  pathwaySlug: string;
  filename: string;
  mimeType: string;
  bytes: number;
  storageBucket: string;
  storagePath: string | null;
  publicUrl: string | null;
  status: string;
};

export type PlanWriteResult =
  | { ok: true; plan: PrivatePlan }
  | { ok: false; conflict: true; currentRevision: number; planId: string }
  | { ok: false; missing: true }
  | { ok: false; denied: true };

export type AssetLinkResult =
  | { ok: true; asset: LinkedAsset; created: boolean }
  | { ok: false; missing: true }
  | { ok: false; denied: true };

export interface OperatorStore {
  createSession(input: { ownerUserId: string; workspaceKey?: string; context?: Partial<OperatorSessionContext> }): Promise<OperatorSessionView>;
  readSession(sessionId: string, ownerUserId: string): Promise<SessionAccess>;
  listSessions(ownerUserId: string, limit: number): Promise<SessionSummary[]>;
  archiveSession(sessionId: string, ownerUserId: string): Promise<SessionAccess>;
  touchContext(sessionId: string, ownerUserId: string, context: OperatorSessionContext): Promise<void>;
  findRun(ownerUserId: string, requestId: string): Promise<StoredExecution | null>;
  claimRun(input: {
    ownerUserId: string;
    sessionId: string;
    requestId: string;
    command: string;
    context: OperatorSessionContext;
  }): Promise<{ state: "fresh"; runId: string } | { state: "replay"; execution: StoredExecution } | { state: "pending" }>;
  completeRun(input: {
    runId: string;
    ownerUserId: string;
    action: string | null;
    classification: OperatorClassification | null;
    permission: StudioPermission | null;
    approvalRequired: boolean;
    status: OperatorRunStatus;
    summary: string;
    context: OperatorSessionContext;
    data: Record<string, unknown>;
  }): Promise<OperatorRunRecord>;
  appendRun(input: {
    ownerUserId: string;
    sessionId: string;
    requestId: string | null;
    command: string;
    action: string | null;
    classification: OperatorClassification | null;
    permission: StudioPermission | null;
    approvalRequired: boolean;
    status: OperatorRunStatus;
    summary: string;
    context: OperatorSessionContext;
    data: Record<string, unknown>;
  }): Promise<OperatorRunRecord>;
  createPlan(plan: PrivatePlan): Promise<PrivatePlan>;
  listPlans(ownerUserId: string, limit: number): Promise<PrivatePlan[]>;
  getPlan(planId: string, ownerUserId: string): Promise<{ status: "ok"; plan: PrivatePlan } | { status: "missing" } | { status: "denied" }>;
  savePlan(ownerUserId: string, plan: PrivatePlan, expectedRevision: number): Promise<PlanWriteResult>;
  saveScratch(note: ScratchNote): Promise<ScratchNote>;
  listScratch(ownerUserId: string, sessionId: string | null): Promise<ScratchNote[]>;
  linkAsset(input: { ownerUserId: string; sessionId: string; assetId: string; use: "reference" | "draft_source" }): Promise<AssetLinkResult>;
  listAssets(ownerUserId: string, sessionId: string): Promise<LinkedAsset[]>;
}

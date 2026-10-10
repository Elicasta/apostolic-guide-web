import type { TeleprompterDocument } from "./types";
import { createTeleprompterDocument, saveTeleprompterDocuments } from "./storage";

export interface CloudTeleprompterDocument {
  id: string;
  title: string;
  content: string;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}
interface CloudBaseline { revision: number; fingerprint: string }
type BaselineMap = Record<string, CloudBaseline>;
const BASELINE_KEY = "ag:teleprompter:cloud-baselines:v1";
const ENDPOINT = "/api/teleprompter/documents";

export function documentFingerprint(doc: Pick<TeleprompterDocument, "title" | "content">): string {
  // Stable light-weight change detector; DB compare-and-swap remains the real concurrency guard.
  const text = JSON.stringify([doc.title, doc.content]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
export function getCloudBaselines(): BaselineMap {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(BASELINE_KEY) || "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) return value as BaselineMap;
  } catch { /* Malformed cache must not prevent recovery. */ }
  return {};
}
export function setCloudBaseline(document: Pick<TeleprompterDocument, "id" | "title" | "content">, revision: number) {
  if (typeof window === "undefined") return;
  const baselines = getCloudBaselines();
  baselines[document.id] = { revision, fingerprint: documentFingerprint(document) };
  window.localStorage.setItem(BASELINE_KEY, JSON.stringify(baselines));
}
export function deleteCloudBaseline(id: string) {
  if (typeof window === "undefined") return;
  const baselines = getCloudBaselines();
  delete baselines[id];
  window.localStorage.setItem(BASELINE_KEY, JSON.stringify(baselines));
}
export function fromCloud(row: CloudTeleprompterDocument): TeleprompterDocument {
  return {
    id: row.id, title: row.title, content: row.content,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
export function mergeCloudLibrary(
  local: TeleprompterDocument[],
  cloud: CloudTeleprompterDocument[],
  baselines: BaselineMap,
): { documents: TeleprompterDocument[]; recoveryCount: number; localOnly: TeleprompterDocument[] } {
  const cloudIds = new Set(cloud.map(row => row.id));
  const activeCloud = cloud.filter(row => !row.deleted_at);
  const localMap = new Map(local.map(doc => [doc.id, doc]));
  const recovery: TeleprompterDocument[] = [];
  for (const row of cloud) {
    const existing = localMap.get(row.id);
    if (!existing) continue;
    if (existing.title === row.title && existing.content === row.content) continue;
    const baseline = baselines[row.id];
    const hasLocalEdit = baseline
      ? baseline.fingerprint !== documentFingerprint(existing)
      : existing.updatedAt !== existing.createdAt;
    if (hasLocalEdit) {
      recovery.push(createTeleprompterDocument(`${existing.title} (local recovery)`, existing.content));
    }
  }
  const localOnly = local.filter(doc => !cloudIds.has(doc.id));
  return {
    documents: [...recovery, ...activeCloud.map(fromCloud), ...localOnly],
    recoveryCount: recovery.length,
    localOnly,
  };
}

async function checkedFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin" });
  if (!response.ok) {
    const error = new Error(`Cloud storage request failed (${response.status})`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response;
}
export async function fetchCloudDocuments(): Promise<CloudTeleprompterDocument[]> {
  const response = await checkedFetch(ENDPOINT);
  const data = await response.json() as { documents: CloudTeleprompterDocument[] };
  return data.documents;
}
export async function saveCloudDocument(doc: TeleprompterDocument, expectedRevision: number): Promise<number> {
  const response = await checkedFetch(ENDPOINT, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: doc.id, title: doc.title, content: doc.content, expectedRevision }),
  });
  const data = await response.json() as { document: { revision: number } };
  setCloudBaseline(doc, data.document.revision);
  return data.document.revision;
}
export async function deleteCloudDocument(id: string, expectedRevision: number): Promise<void> {
  await checkedFetch(ENDPOINT, {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, expectedRevision }),
  });
  deleteCloudBaseline(id);
}
export async function hydrateCloudLibrary(
  local: TeleprompterDocument[],
): Promise<{ documents: TeleprompterDocument[]; recoveryCount: number; importedCount: number }> {
  const cloud = await fetchCloudDocuments();
  const { documents, recoveryCount, localOnly } = mergeCloudLibrary(local, cloud, getCloudBaselines());
  // Store remote baseline before subsequent local edits, but never overwrite recovery copies.
  for (const row of cloud) {
    if (row.deleted_at) deleteCloudBaseline(row.id);
    else setCloudBaseline(fromCloud(row), row.revision);
  }
  saveTeleprompterDocuments(documents);
  let importedCount = 0;
  for (const document of localOnly) {
    try {
      await saveCloudDocument(document, 0);
      importedCount++;
    } catch {
      // Local copy stays intact, including if another device created the same ID.
    }
  }
  return { documents, recoveryCount, importedCount };
}

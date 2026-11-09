import type { TeleprompterDocument } from "./types";
import { EPISODE_01_SCRIPT } from "./episodes/episode-01";
import {
  TEACHING_SESSION_ID,
  TEACHING_SESSION_SCRIPT,
  TEACHING_SESSION_TITLE,
  TEACHING_SESSION_VERSION,
} from "./teaching-session";

export const TELEPROMPTER_STORAGE_KEY = "ag:teleprompter:documents:v1";
export const TELEPROMPTER_LAST_DOCUMENT_KEY = "ag:teleprompter:last-presented:v1";
export const TELEPROMPTER_TEACHING_RESET_KEY = "ag:teleprompter:teaching-reset:v1";
export const TELEPROMPTER_PREVIOUS_SCRIPTS_KEY = "ag:teleprompter:previous-scripts:20261108";

export const DEFAULT_TELEPROMPTER_CONTENT =
  "# Opening\n**Main idea**\n• Teaching point\n@ref John 1:1\n\n---\n\n# Next Section\n**Second idea**\n• Explain in your own words.";

// Compatibility export for older imports; this is no longer seeded.
export const JESUS_IS_GOD_SAMPLE = EPISODE_01_SCRIPT;

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `tp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createTeleprompterDocument(
  title = "Untitled Script",
  content = DEFAULT_TELEPROMPTER_CONTENT,
): TeleprompterDocument {
  const now = new Date().toISOString();
  return { id: makeId(), title, content, createdAt: now, updatedAt: now };
}

function getTeachingSeed(): TeleprompterDocument {
  return {
    id: TEACHING_SESSION_ID,
    title: TEACHING_SESSION_TITLE,
    content: TEACHING_SESSION_SCRIPT,
    createdAt: "2026-11-08T00:00:00.000Z",
    updatedAt: "2026-11-08T00:00:00.000Z",
  };
}

export function getSeedDocuments(): TeleprompterDocument[] {
  return [getTeachingSeed()];
}

export function isUntouchedStarterDocument(document: TeleprompterDocument) {
  return document.title === "Untitled Script" && document.content === DEFAULT_TELEPROMPTER_CONTENT;
}

export function getLastPresentedDocumentId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TELEPROMPTER_LAST_DOCUMENT_KEY) || "";
}

export function setLastPresentedDocumentId(documentId: string) {
  if (typeof window === "undefined" || !documentId) return;
  window.localStorage.setItem(TELEPROMPTER_LAST_DOCUMENT_KEY, documentId);
}

export function getPreviousTeleprompterScriptsBackup() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TELEPROMPTER_PREVIOUS_SCRIPTS_KEY);
}

export function selectTeleprompterDocument(
  documents: TeleprompterDocument[],
  requestedDocumentId?: string | null,
) {
  const requested = documents.find((document) => document.id === requestedDocumentId);
  if (requested && !isUntouchedStarterDocument(requested)) return requested;

  const lastPresentedId = getLastPresentedDocumentId();
  const lastPresented = documents.find((document) => document.id === lastPresentedId);
  if (lastPresented && !isUntouchedStarterDocument(lastPresented)) return lastPresented;

  return (
    documents.find((document) => document.id === TEACHING_SESSION_ID) ??
    documents.find((document) => !isUntouchedStarterDocument(document)) ??
    documents[0]
  );
}

function isDocument(value: unknown): value is TeleprompterDocument {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.content === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
}

function parseDocuments(raw: string | null): TeleprompterDocument[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every(isDocument) ? value : [];
  } catch {
    return [];
  }
}

/**
 * One-time owner-requested changeover from the old script collection to a
 * single section-based teaching guide. This is per-browser localStorage.
 * Preserve every existing document in a separate JSON backup before replacing
 * the active library. Edits made after the changeover are never reseeded.
 */
export function migrateToTeachingGuide(storage: Pick<Storage, "getItem" | "setItem">) {
  const currentRaw = storage.getItem(TELEPROMPTER_STORAGE_KEY);
  if (storage.getItem(TELEPROMPTER_TEACHING_RESET_KEY) === TEACHING_SESSION_VERSION) {
    const documents = parseDocuments(currentRaw);
    if (documents.length > 0) return documents;
    const seed = getSeedDocuments();
    storage.setItem(TELEPROMPTER_STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  if (currentRaw !== null && storage.getItem(TELEPROMPTER_PREVIOUS_SCRIPTS_KEY) === null) {
    // If this backup cannot be written, leave the old active data untouched.
    storage.setItem(TELEPROMPTER_PREVIOUS_SCRIPTS_KEY, currentRaw);
  }

  const seed = getSeedDocuments();
  storage.setItem(TELEPROMPTER_STORAGE_KEY, JSON.stringify(seed));
  storage.setItem(TELEPROMPTER_LAST_DOCUMENT_KEY, TEACHING_SESSION_ID);
  storage.setItem(TELEPROMPTER_TEACHING_RESET_KEY, TEACHING_SESSION_VERSION);
  return seed;
}

export function loadTeleprompterDocuments(): TeleprompterDocument[] {
  if (typeof window === "undefined") return [];
  try {
    return migrateToTeachingGuide(window.localStorage);
  } catch (error) {
    console.error("Teleprompter teaching guide migration could not be saved", error);
    return parseDocuments(window.localStorage.getItem(TELEPROMPTER_STORAGE_KEY)).length
      ? parseDocuments(window.localStorage.getItem(TELEPROMPTER_STORAGE_KEY))
      : getSeedDocuments();
  }
}

export function saveTeleprompterDocuments(documents: TeleprompterDocument[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TELEPROMPTER_STORAGE_KEY, JSON.stringify(documents));
}

export function duplicateTeleprompterDocument(document: TeleprompterDocument) {
  return createTeleprompterDocument(`${document.title} Copy`, document.content);
}

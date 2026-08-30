import type { TeleprompterDocument } from "./types";
import { EPISODE_01_SCRIPT, EPISODE_01_TITLE } from "./episodes/episode-01";

export const TELEPROMPTER_STORAGE_KEY = "ag:teleprompter:documents:v1";
export const TELEPROMPTER_LAST_DOCUMENT_KEY = "ag:teleprompter:last-presented:v1";

export const DEFAULT_TELEPROMPTER_CONTENT = "# Intro\nPut the full opening section here.\n\n@note Private speaking cue.\n\n---\n\n# Point 1\nEach --- starts a new teleprompter page. Keep the whole section together.";

// Kept as a compatibility export for existing imports.
export const JESUS_IS_GOD_SAMPLE = EPISODE_01_SCRIPT;

const EPISODE_01_ID = "apostolic-guide-episode-01";
const EPISODE_01_SEEDED_AT = "2026-08-30T06:15:00.000Z";

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

function getEpisodeOneSeed(): TeleprompterDocument {
  return {
    id: EPISODE_01_ID,
    title: `Episode 1: ${EPISODE_01_TITLE}`,
    content: EPISODE_01_SCRIPT,
    createdAt: EPISODE_01_SEEDED_AT,
    updatedAt: EPISODE_01_SEEDED_AT,
  };
}

export function getSeedDocuments(): TeleprompterDocument[] {
  return [getEpisodeOneSeed()];
}

function isOriginalJesusSeed(document: TeleprompterDocument) {
  return (
    document.title === "Jesus Is God" &&
    document.content.includes("# Before. After. Beside.") &&
    document.content.includes("# Put It Together") &&
    document.content.includes("# Where We Go Next")
  );
}

function isUntouchedPreviousJesusSeed(document: TeleprompterDocument) {
  return (
    document.title === "Jesus Is God" &&
    document.updatedAt === document.createdAt &&
    document.content.includes("# 1. Start With One God") &&
    document.content.includes("# 7. Who Is The Savior?")
  );
}

function ensureEpisodeOneSeed(documents: TeleprompterDocument[]) {
  if (documents.some((document) => document.id === EPISODE_01_ID)) return documents;

  const replacementIndex = documents.findIndex(
    (document) => isOriginalJesusSeed(document) || isUntouchedPreviousJesusSeed(document),
  );
  const seed = getEpisodeOneSeed();

  if (replacementIndex < 0) return [seed, ...documents];

  return documents.map((document, index) => (index === replacementIndex ? seed : document));
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
    documents.find((document) => document.id === EPISODE_01_ID) ??
    documents.find((document) => document.title === "Jesus Is God") ??
    documents.find((document) => !isUntouchedStarterDocument(document)) ??
    documents[0]
  );
}

export function loadTeleprompterDocuments(): TeleprompterDocument[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(TELEPROMPTER_STORAGE_KEY);
    if (!raw) {
      const seed = getSeedDocuments();
      saveTeleprompterDocuments(seed);
      return seed;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seed = getSeedDocuments();
      saveTeleprompterDocuments(seed);
      return seed;
    }

    const documents = ensureEpisodeOneSeed(parsed as TeleprompterDocument[]);
    saveTeleprompterDocuments(documents);
    return documents;
  } catch {
    return getSeedDocuments();
  }
}

export function saveTeleprompterDocuments(documents: TeleprompterDocument[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TELEPROMPTER_STORAGE_KEY, JSON.stringify(documents));
}

export function duplicateTeleprompterDocument(document: TeleprompterDocument) {
  return createTeleprompterDocument(`${document.title} Copy`, document.content);
}

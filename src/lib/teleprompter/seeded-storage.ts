import type { TeleprompterDocument } from "./types";
import {
  DEFAULT_TELEPROMPTER_CONTENT,
  JESUS_IS_GOD_SAMPLE,
  TELEPROMPTER_LAST_DOCUMENT_KEY,
  TELEPROMPTER_STORAGE_KEY,
  createTeleprompterDocument,
  duplicateTeleprompterDocument,
  getLastPresentedDocumentId,
  getSeedDocuments as getLegacySeedDocuments,
  isUntouchedStarterDocument,
  loadTeleprompterDocuments as loadLegacyDocuments,
  saveTeleprompterDocuments,
  selectTeleprompterDocument,
  setLastPresentedDocumentId,
} from "./storage";
import {
  TELEPROMPTER_EPISODE_SEED_KEY,
  TELEPROMPTER_EPISODE_SEED_VERSION,
  getEpisodeSeedDocuments,
} from "./episodes";

export {
  DEFAULT_TELEPROMPTER_CONTENT,
  JESUS_IS_GOD_SAMPLE,
  TELEPROMPTER_LAST_DOCUMENT_KEY,
  TELEPROMPTER_STORAGE_KEY,
  createTeleprompterDocument,
  duplicateTeleprompterDocument,
  getLastPresentedDocumentId,
  isUntouchedStarterDocument,
  saveTeleprompterDocuments,
  selectTeleprompterDocument,
  setLastPresentedDocumentId,
};

export function getSeedDocuments(): TeleprompterDocument[] {
  return [...getLegacySeedDocuments(), ...getEpisodeSeedDocuments()];
}

export function mergeEpisodeSeeds(
  documents: TeleprompterDocument[],
  episodeSeeds = getEpisodeSeedDocuments(),
): TeleprompterDocument[] {
  const existingIds = new Set(documents.map((document) => document.id));
  return [...documents, ...episodeSeeds.filter((document) => !existingIds.has(document.id))];
}

export function loadTeleprompterDocuments(): TeleprompterDocument[] {
  const documents = loadLegacyDocuments();
  if (typeof window === "undefined") return documents;

  const installedVersion = Number(
    window.localStorage.getItem(TELEPROMPTER_EPISODE_SEED_KEY) || "0",
  );

  if (installedVersion >= TELEPROMPTER_EPISODE_SEED_VERSION) return documents;

  const merged = mergeEpisodeSeeds(documents);
  saveTeleprompterDocuments(merged);
  window.localStorage.setItem(
    TELEPROMPTER_EPISODE_SEED_KEY,
    String(TELEPROMPTER_EPISODE_SEED_VERSION),
  );
  return merged;
}

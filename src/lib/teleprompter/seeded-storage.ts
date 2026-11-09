import type { TeleprompterDocument } from "./types";
import {
  DEFAULT_TELEPROMPTER_CONTENT,
  JESUS_IS_GOD_SAMPLE,
  TELEPROMPTER_LAST_DOCUMENT_KEY,
  TELEPROMPTER_STORAGE_KEY,
  TELEPROMPTER_TEACHING_RESET_KEY,
  TELEPROMPTER_PREVIOUS_SCRIPTS_KEY,
  createTeleprompterDocument,
  duplicateTeleprompterDocument,
  getLastPresentedDocumentId,
  getPreviousTeleprompterScriptsBackup,
  getSeedDocuments as getCurrentSeedDocuments,
  isUntouchedStarterDocument,
  loadTeleprompterDocuments as loadCurrentDocuments,
  saveTeleprompterDocuments,
  selectTeleprompterDocument,
  setLastPresentedDocumentId,
} from "./storage";
import {
  TELEPROMPTER_EPISODE_PREVIOUS_SEEDED_AT,
  getEpisodeSeedDocuments,
} from "./episodes";

export {
  DEFAULT_TELEPROMPTER_CONTENT,
  JESUS_IS_GOD_SAMPLE,
  TELEPROMPTER_LAST_DOCUMENT_KEY,
  TELEPROMPTER_STORAGE_KEY,
  TELEPROMPTER_TEACHING_RESET_KEY,
  TELEPROMPTER_PREVIOUS_SCRIPTS_KEY,
  createTeleprompterDocument,
  duplicateTeleprompterDocument,
  getLastPresentedDocumentId,
  getPreviousTeleprompterScriptsBackup,
  isUntouchedStarterDocument,
  saveTeleprompterDocuments,
  selectTeleprompterDocument,
  setLastPresentedDocumentId,
};

// The old episode sources are retained in Git history and as compatibility
// utilities, but no longer installed in the active teleprompter library.
export function getSeedDocuments(): TeleprompterDocument[] {
  return getCurrentSeedDocuments();
}

function isUntouchedPreviousEpisodeSeed(document: TeleprompterDocument) {
  return (
    document.id.startsWith("apostolic-guide-episode-") &&
    document.createdAt === TELEPROMPTER_EPISODE_PREVIOUS_SEEDED_AT &&
    document.updatedAt === TELEPROMPTER_EPISODE_PREVIOUS_SEEDED_AT
  );
}

// Compatibility helper used by historical migration tests. Not called by
// the current loader, which deliberately keeps the new library to one guide.
export function mergeEpisodeSeeds(
  documents: TeleprompterDocument[],
  episodeSeeds = getEpisodeSeedDocuments(),
): TeleprompterDocument[] {
  const seedById = new Map(episodeSeeds.map((seed) => [seed.id, seed]));
  const seenIds = new Set<string>();

  const merged = documents.map((document) => {
    const seed = seedById.get(document.id);
    if (!seed) return document;
    seenIds.add(document.id);
    if (!isUntouchedPreviousEpisodeSeed(document)) return document;
    return { ...seed, createdAt: document.createdAt };
  });

  for (const seed of episodeSeeds) {
    if (!seenIds.has(seed.id) && !documents.some((document) => document.id === seed.id)) {
      merged.push(seed);
    }
  }
  return merged;
}

export function loadTeleprompterDocuments(): TeleprompterDocument[] {
  return loadCurrentDocuments();
}

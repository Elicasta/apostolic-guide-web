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
  TELEPROMPTER_EPISODE_PREVIOUS_SEEDED_AT,
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

function isUntouchedPreviousEpisodeSeed(document: TeleprompterDocument) {
  return (
    document.id.startsWith("apostolic-guide-episode-") &&
    document.createdAt === TELEPROMPTER_EPISODE_PREVIOUS_SEEDED_AT &&
    document.updatedAt === TELEPROMPTER_EPISODE_PREVIOUS_SEEDED_AT
  );
}

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

    return {
      ...seed,
      createdAt: document.createdAt,
    };
  });

  for (const seed of episodeSeeds) {
    if (!seenIds.has(seed.id) && !documents.some((document) => document.id === seed.id)) {
      merged.push(seed);
    }
  }

  return merged;
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

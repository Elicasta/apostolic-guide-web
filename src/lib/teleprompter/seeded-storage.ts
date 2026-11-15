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
import {
  TELEPROMPTER_PERSONAL_SEED_KEY,
  TELEPROMPTER_PERSONAL_SEED_VERSION,
  getPersonalChannelSeedDocuments,
} from "./personal";
import {
  TELEPROMPTER_DOCTRINE_SEED_KEY,
  TELEPROMPTER_DOCTRINE_SEED_VERSION,
  getDoctrineSeedDocuments,
} from "./doctrine";

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
  return [
    ...getLegacySeedDocuments(),
    ...getEpisodeSeedDocuments(),
    ...getPersonalChannelSeedDocuments(),
    ...getDoctrineSeedDocuments(),
  ];
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

// Doctrine drafts are a separate install. Do not fold them into mergeEpisodeSeeds:
// that refresh rewrites untouched previous Apostolic Guide episode documents.
// Missing doctrine ids are added. An existing id, including an edit or a script
// Eli created, is left in place. After the version key is stored, a deletion stays
// deleted until the doctrine seed version is intentionally raised.
export function mergeDoctrineSeeds(
  documents: TeleprompterDocument[],
  doctrineSeeds = getDoctrineSeedDocuments(),
): TeleprompterDocument[] {
  const existingIds = new Set(documents.map((document) => document.id));
  const additions = doctrineSeeds.filter((seed) => !existingIds.has(seed.id));
  return [...additions, ...documents];
}

// New personal-channel episodes are installed once per browser without modifying
// existing scripts. Preserve user edits and intentional deletions after installation.
export function mergePersonalChannelSeeds(
  documents: TeleprompterDocument[],
  personalSeeds = getPersonalChannelSeedDocuments(),
): TeleprompterDocument[] {
  const existingIds = new Set(documents.map((document) => document.id));
  return [
    ...personalSeeds.filter((seed) => !existingIds.has(seed.id)),
    ...documents,
  ];
}

export function loadTeleprompterDocuments(): TeleprompterDocument[] {
  let documents = loadLegacyDocuments();
  if (typeof window === "undefined") return documents;

  const installedVersion = Number(
    window.localStorage.getItem(TELEPROMPTER_EPISODE_SEED_KEY) || "0",
  );

  if (installedVersion < TELEPROMPTER_EPISODE_SEED_VERSION) {
    documents = mergeEpisodeSeeds(documents);
    saveTeleprompterDocuments(documents);
    window.localStorage.setItem(
      TELEPROMPTER_EPISODE_SEED_KEY,
      String(TELEPROMPTER_EPISODE_SEED_VERSION),
    );
  }

  const installedPersonalVersion = Number(
    window.localStorage.getItem(TELEPROMPTER_PERSONAL_SEED_KEY) || "0",
  );

  if (installedPersonalVersion < TELEPROMPTER_PERSONAL_SEED_VERSION) {
    documents = mergePersonalChannelSeeds(documents);
    saveTeleprompterDocuments(documents);
    window.localStorage.setItem(
      TELEPROMPTER_PERSONAL_SEED_KEY,
      String(TELEPROMPTER_PERSONAL_SEED_VERSION),
    );
  }

  const installedDoctrineVersion = Number(
    window.localStorage.getItem(TELEPROMPTER_DOCTRINE_SEED_KEY) || "0",
  );

  if (installedDoctrineVersion < TELEPROMPTER_DOCTRINE_SEED_VERSION) {
    documents = mergeDoctrineSeeds(documents);
    saveTeleprompterDocuments(documents);
    window.localStorage.setItem(
      TELEPROMPTER_DOCTRINE_SEED_KEY,
      String(TELEPROMPTER_DOCTRINE_SEED_VERSION),
    );
  }

  return documents;
}

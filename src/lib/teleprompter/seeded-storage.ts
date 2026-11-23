import type { TeleprompterDocument } from "./types";
import {
  DEFAULT_TELEPROMPTER_CONTENT,
  JESUS_IS_GOD_SAMPLE,
  TELEPROMPTER_LAST_DOCUMENT_KEY,
  TELEPROMPTER_STORAGE_KEY,
  TELEPROMPTER_LEGACY_EPISODES_RETIRED_KEY,
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
  DOCTRINE_EPISODES,
  TELEPROMPTER_DOCTRINE_SEED_KEY,
  TELEPROMPTER_DOCTRINE_SEED_VERSION,
  doctrineDocumentId,
  doctrineDocumentTitle,
  getDoctrineSeedDocuments,
} from "./doctrine";
import { buildLegacyDoctrineScript } from "./doctrine/script";
import {
  TELEPROMPTER_PATHWAY_SEED_KEY,
  TELEPROMPTER_PATHWAY_SIGNATURES_KEY,
  getPathwaySeedDocuments,
  getPathwaySeedSignatures,
  pathwayDocumentSignature,
} from "./pathways";
import {
  TEACHING_SESSION_ID,
  TEACHING_SESSION_SCRIPT,
  TEACHING_SESSION_TITLE,
  TEACHING_SESSION_VERSION,
  TEACHING_SESSION_SEED_KEY,
  TEACHING_SESSION_SEEDED_AT,
} from "./teaching-session";

export {
  DEFAULT_TELEPROMPTER_CONTENT,
  JESUS_IS_GOD_SAMPLE,
  TELEPROMPTER_LAST_DOCUMENT_KEY,
  TELEPROMPTER_STORAGE_KEY,
  TELEPROMPTER_LEGACY_EPISODES_RETIRED_KEY,
  createTeleprompterDocument,
  duplicateTeleprompterDocument,
  getLastPresentedDocumentId,
  isUntouchedStarterDocument,
  saveTeleprompterDocuments,
  selectTeleprompterDocument,
  setLastPresentedDocumentId,
};

export const TELEPROMPTER_DOCTRINE_BACKUP_KEY = "ag:teleprompter:doctrine:before-v2";

export const TELEPROMPTER_LEGACY_ARCHIVE_KEY = "ag:teleprompter:archived-episodes:v1";

const LEGACY_EPISODE_ID = /^apostolic-guide-episode-(0[1-9]|1[0-2])$/;

export function getLegacyArchiveRaw(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TELEPROMPTER_LEGACY_ARCHIVE_KEY);
}

/** Remove retired Episode 01-12 from the active library only after securing a
 * browser-local backup. Custom scripts and the new Doctrine set stay intact. */
export function archiveLegacyEpisodes(documents: TeleprompterDocument[]): TeleprompterDocument[] {
  if (typeof window === "undefined") return documents;
  const storage = window.localStorage;
  if (storage.getItem(TELEPROMPTER_LEGACY_EPISODES_RETIRED_KEY) === "1") return documents;
  const older = documents.filter((document) => LEGACY_EPISODE_ID.test(document.id));
  if (!older.length) {
    try { storage.setItem(TELEPROMPTER_LEGACY_EPISODES_RETIRED_KEY, "1"); } catch { /* Retry on next load. */ }
    return documents;
  }
  try {
    // Keep the full old manuscripts, including any edits, before removing them.
    const existing = getLegacyArchiveRaw();
    const parsed: unknown = existing ? JSON.parse(existing) : [];
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== "object" || typeof item.id !== "string")) {
      return documents;
    }
    const archive = parsed as TeleprompterDocument[];
    const archivedIds = new Set(archive.map((document) => document.id));
    const combined = [...archive, ...older.filter((document) => !archivedIds.has(document.id))];
    storage.setItem(TELEPROMPTER_LEGACY_ARCHIVE_KEY, JSON.stringify(combined));
    const current = documents.filter((document) => !LEGACY_EPISODE_ID.test(document.id));
    saveTeleprompterDocuments(current);
    storage.setItem(TELEPROMPTER_LEGACY_EPISODES_RETIRED_KEY, "1");
    return current;
  } catch {
    // Never discard old material when storage cannot hold a backup.
    return documents;
  }
}


export function getDoctrineBackupRaw(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TELEPROMPTER_DOCTRINE_BACKUP_KEY);
}

function teachingGuideSeed(): TeleprompterDocument {
  return {
    id: TEACHING_SESSION_ID,
    title: TEACHING_SESSION_TITLE,
    content: TEACHING_SESSION_SCRIPT,
    createdAt: TEACHING_SESSION_SEEDED_AT,
    updatedAt: TEACHING_SESSION_SEEDED_AT,
  };
}

export function mergeTeachingGuideSeed(documents: TeleprompterDocument[]): TeleprompterDocument[] {
  return documents.some((document) => document.id === TEACHING_SESSION_ID)
    ? documents
    : [teachingGuideSeed(), ...documents];
}

export function getSeedDocuments(): TeleprompterDocument[] {
  return [
    ...getLegacySeedDocuments(),
    ...getEpisodeSeedDocuments(),
    ...getPersonalChannelSeedDocuments(),
    ...getDoctrineSeedDocuments(),
    ...getPathwaySeedDocuments(),
    teachingGuideSeed(),
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

/**
 * Upgrade only exact, unchanged v1 doctrine scripts. Do not refresh a custom
 * title, edited text, a deleted episode, or any unrelated script. A missing
 * seeded ID is intentionally not restored during a version upgrade.
 */
export function upgradeDoctrineSeeds(
  documents: TeleprompterDocument[],
  doctrineSeeds = getDoctrineSeedDocuments(),
): TeleprompterDocument[] {
  const newest = new Map(doctrineSeeds.map((document) => [document.id, document]));
  const originals = new Map(DOCTRINE_EPISODES.map((episode) => [
    doctrineDocumentId(episode.number),
    {
      title: doctrineDocumentTitle(episode),
      content: buildLegacyDoctrineScript(episode),
    },
  ]));

  return documents.map((document) => {
    const legacy = originals.get(document.id);
    const next = newest.get(document.id);
    if (!legacy || !next || document.title !== legacy.title || document.content !== legacy.content) {
      return document;
    }
    return {
      ...document,
      content: next.content,
      updatedAt: next.updatedAt,
    };
  });
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

/**
 * Install the 20 website-matched Pathway read-alongs once per browser.
 * Future public-site edits automatically update only untouched copies.
 * Edited and deleted copies are never silently overwritten or restored.
 */
export function mergePathwayReadAlongs(
  documents: TeleprompterDocument[],
  previousSignatures: Record<string, string> | null,
  seeds = getPathwaySeedDocuments(),
): TeleprompterDocument[] {
  const currentById = new Map(seeds.map((seed) => [seed.id, seed]));
  if (!previousSignatures) {
    const existingIds = new Set(documents.map((document) => document.id));
    return [...seeds.filter((seed) => !existingIds.has(seed.id)), ...documents];
  }
  return documents.map((document) => {
    const current = currentById.get(document.id);
    const previous = previousSignatures[document.id];
    if (!current || !previous || pathwayDocumentSignature(document) !== previous) return document;
    if (pathwayDocumentSignature(current) === previous) return document;
    return { ...current, createdAt: document.createdAt };
  });
}

function readPathwaySignatures(): Record<string, string> | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TELEPROMPTER_PATHWAY_SIGNATURES_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, value]) => key.startsWith("ag-pathway-") && typeof value === "string"),
    );
  } catch {
    return null;
  }
}

function installPathwayReadAlongs(documents: TeleprompterDocument[]): TeleprompterDocument[] {
  if (typeof window === "undefined") return documents;
  const storage = window.localStorage;
  const installed = storage.getItem(TELEPROMPTER_PATHWAY_SEED_KEY) === "1";
  const signatures = readPathwaySignatures();
  // Incomplete installs may retry. Once installed, a missing snapshot must
  // NEVER be treated as permission to resurrect intentionally deleted drafts.
  if (installed && !signatures) return documents;
  const next = mergePathwayReadAlongs(documents, installed ? signatures : null);
  const currentSignatures = getPathwaySeedSignatures();
  try {
    if (next !== documents && (
      next.length !== documents.length ||
      next.some((item, index) => item !== documents[index])
    )) saveTeleprompterDocuments(next);
    storage.setItem(TELEPROMPTER_PATHWAY_SIGNATURES_KEY, JSON.stringify(currentSignatures));
    storage.setItem(TELEPROMPTER_PATHWAY_SEED_KEY, "1");
    return next;
  } catch {
    // Do not mark installed or update the snapshot on storage failure.
    // The existing drafts remain available for a later retry.
    return documents;
  }
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
    const next = installedDoctrineVersion === 0
      ? mergeDoctrineSeeds(documents)
      : upgradeDoctrineSeeds(documents);

    // Do not destroy the previous source on devices unable to store a backup.
    // The install can retry later without replacing any edited documents.
    if (next !== documents && next.some((item, index) => item !== documents[index])) {
      if (installedDoctrineVersion > 0 && !getDoctrineBackupRaw()) {
        try {
          window.localStorage.setItem(
            TELEPROMPTER_DOCTRINE_BACKUP_KEY,
            JSON.stringify(documents),
          );
        } catch {
          return documents;
        }
      }
      try {
        saveTeleprompterDocuments(next);
        documents = next;
      } catch {
        return documents;
      }
    }
    window.localStorage.setItem(
      TELEPROMPTER_DOCTRINE_SEED_KEY,
      String(TELEPROMPTER_DOCTRINE_SEED_VERSION),
    );
  }

  const installedGuideVersion = Number(
    window.localStorage.getItem(TEACHING_SESSION_SEED_KEY) || "0",
  );
  if (installedGuideVersion < TEACHING_SESSION_VERSION) {
    const next = mergeTeachingGuideSeed(documents);
    if (next !== documents) {
      try {
        saveTeleprompterDocuments(next);
        documents = next;
      } catch {
        return documents;
      }
    }
    window.localStorage.setItem(TEACHING_SESSION_SEED_KEY, String(TEACHING_SESSION_VERSION));
  }

  return installPathwayReadAlongs(archiveLegacyEpisodes(documents));
}

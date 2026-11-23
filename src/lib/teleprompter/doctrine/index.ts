import type { TeleprompterDocument } from "../types";
import catalog from "./catalog.json";
import { buildDoctrineScript } from "./script";
import type { DoctrineEpisode } from "./types";

export const TELEPROMPTER_DOCTRINE_SEED_VERSION = 2;
export const TELEPROMPTER_DOCTRINE_SEED_KEY = "ag:teleprompter:doctrine-seed:v1";
export const TELEPROMPTER_DOCTRINE_SEEDED_AT = "2026-11-22T00:00:00.000Z";

export const DOCTRINE_EPISODES = catalog as DoctrineEpisode[];

export function doctrineDocumentId(episodeNumber: number) {
  return `ag-doctrine-ep-${String(episodeNumber).padStart(2, "0")}`;
}

export function doctrineDocumentTitle(episode: DoctrineEpisode) {
  const number = String(episode.number).padStart(2, "0");
  return `AG Doctrine ${number} · ${episode.title} · Batch ${episode.batch}: ${episode.batchLabel}`;
}

export function getDoctrineSeedDocuments(): TeleprompterDocument[] {
  return DOCTRINE_EPISODES.map((episode) => ({
    id: doctrineDocumentId(episode.number),
    title: doctrineDocumentTitle(episode),
    content: buildDoctrineScript(episode),
    createdAt: TELEPROMPTER_DOCTRINE_SEEDED_AT,
    updatedAt: TELEPROMPTER_DOCTRINE_SEEDED_AT,
  }));
}

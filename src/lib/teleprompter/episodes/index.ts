import type { TeleprompterDocument } from "../types";
import { EPISODE_02_SCRIPT, EPISODE_02_TITLE } from "./episode-02";
import { EPISODE_03_SCRIPT, EPISODE_03_TITLE } from "./episode-03";
import { EPISODE_04_SCRIPT, EPISODE_04_TITLE } from "./episode-04";
import { EPISODE_05_SCRIPT, EPISODE_05_TITLE } from "./episode-05";
import { EPISODE_06_SCRIPT, EPISODE_06_TITLE } from "./episode-06";
import { EPISODE_07_SCRIPT, EPISODE_07_TITLE } from "./episode-07";
import { EPISODE_08_SCRIPT, EPISODE_08_TITLE } from "./episode-08";
import { EPISODE_09_SCRIPT, EPISODE_09_TITLE } from "./episode-09";
import { EPISODE_10_SCRIPT, EPISODE_10_TITLE } from "./episode-10";
import { EPISODE_11_SCRIPT, EPISODE_11_TITLE } from "./episode-11";
import { EPISODE_12_SCRIPT, EPISODE_12_TITLE } from "./episode-12";

export const TELEPROMPTER_EPISODE_PREVIOUS_SEEDED_AT = "2026-08-29T20:00:00.000Z";
export const TELEPROMPTER_EPISODE_SEEDED_AT = "2026-08-30T06:15:00.000Z";

const EPISODES = [
  [2, EPISODE_02_TITLE, EPISODE_02_SCRIPT],
  [3, EPISODE_03_TITLE, EPISODE_03_SCRIPT],
  [4, EPISODE_04_TITLE, EPISODE_04_SCRIPT],
  [5, EPISODE_05_TITLE, EPISODE_05_SCRIPT],
  [6, EPISODE_06_TITLE, EPISODE_06_SCRIPT],
  [7, EPISODE_07_TITLE, EPISODE_07_SCRIPT],
  [8, EPISODE_08_TITLE, EPISODE_08_SCRIPT],
  [9, EPISODE_09_TITLE, EPISODE_09_SCRIPT],
  [10, EPISODE_10_TITLE, EPISODE_10_SCRIPT],
  [11, EPISODE_11_TITLE, EPISODE_11_SCRIPT],
  [12, EPISODE_12_TITLE, EPISODE_12_SCRIPT],
] as const;

export const TELEPROMPTER_EPISODE_SEED_VERSION = 4;
export const TELEPROMPTER_EPISODE_SEED_KEY = "ag:teleprompter:episode-seed:v4";

export function getEpisodeSeedDocuments(): TeleprompterDocument[] {
  return EPISODES.map(([episode, title, content]) => ({
    id: `apostolic-guide-episode-${String(episode).padStart(2, "0")}`,
    title: `Episode ${episode}: ${title}`,
    content,
    createdAt: TELEPROMPTER_EPISODE_SEEDED_AT,
    updatedAt: TELEPROMPTER_EPISODE_SEEDED_AT,
  }));
}

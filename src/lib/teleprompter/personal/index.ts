import type { TeleprompterDocument } from "../types";
import { ELI_EPISODE_01_SCRIPT, ELI_EPISODE_01_TITLE } from "./episode-01";
import { ELI_EPISODE_02_SCRIPT, ELI_EPISODE_02_TITLE } from "./episode-02";

export const TELEPROMPTER_PERSONAL_SEED_VERSION = 1;
export const TELEPROMPTER_PERSONAL_SEED_KEY = "ag:teleprompter:iameli-seed:v1";
export const TELEPROMPTER_PERSONAL_SEEDED_AT = "2026-11-11T00:00:00.000Z";

const PERSONAL_EPISODES = [
  [1, ELI_EPISODE_01_TITLE, ELI_EPISODE_01_SCRIPT],
  [2, ELI_EPISODE_02_TITLE, ELI_EPISODE_02_SCRIPT],
] as const;

export function getPersonalChannelSeedDocuments(): TeleprompterDocument[] {
  return PERSONAL_EPISODES.map(([episode, title, content]) => ({
    id: `eli-castaneda-episode-${String(episode).padStart(2, "0")}`,
    title: `I Am Eli Castaneda · Episode ${String(episode).padStart(2, "0")}: ${title}`,
    content,
    createdAt: TELEPROMPTER_PERSONAL_SEEDED_AT,
    updatedAt: TELEPROMPTER_PERSONAL_SEEDED_AT,
  }));
}

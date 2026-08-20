export type ForgeLane = "audio" | "carousel" | "youtube";
export type ForgePriority = "urgent" | "high" | "medium" | "low";

export type ForgePathwayState = {
  slug: string;
  title: string;
  campaignRank: number;
  audioReady: boolean;
  audioStale: boolean;
  audioBlocked: boolean;
  carouselProjects: number;
  carouselPublished: number;
  youtubePublished: boolean;
  videoProjectReady: boolean;
  activeRecipes: string[];
};

export type ForgeTask = {
  key: string;
  lane: ForgeLane;
  pathwaySlug: string;
  title: string;
  priority: ForgePriority;
  reason: string;
  recipeKey: "pathway_audio_stage" | "forge_carousel_stage" | "audio_to_youtube";
};

const SCORE: Record<ForgePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function buildForgeQueue(pathways: ForgePathwayState[]) {
  const tasks: ForgeTask[] = [];

  for (const pathway of pathways) {
    if ((pathway.audioBlocked || pathway.audioStale || !pathway.audioReady) && !pathway.activeRecipes.includes("pathway_audio_stage")) {
      tasks.push({
        key: `audio:${pathway.slug}`,
        lane: "audio",
        pathwaySlug: pathway.slug,
        title: `Stage ${pathway.title} audio`,
        priority: pathway.audioStale ? "high" : pathway.audioBlocked ? "medium" : "medium",
        reason: pathway.audioStale
          ? "Existing audio is no longer aligned to the current approved Pathway source."
          : pathway.audioBlocked
            ? "Audio cannot be counted ready until the current narration clears doctrine/editorial gates."
            : "No current Pathway audio exists.",
        recipeKey: "pathway_audio_stage"
      });
    }

    if (pathway.carouselProjects === 0 && !pathway.activeRecipes.includes("forge_carousel_stage")) {
      tasks.push({
        key: `carousel:${pathway.slug}`,
        lane: "carousel",
        pathwaySlug: pathway.slug,
        title: `Build ${pathway.title} carousel`,
        priority: pathway.campaignRank <= 1 ? "high" : "medium",
        reason: "This Pathway has no persistent carousel Creative Project.",
        recipeKey: "forge_carousel_stage"
      });
    }

    if (pathway.audioReady && !pathway.youtubePublished && !pathway.activeRecipes.includes("audio_to_youtube")) {
      tasks.push({
        key: `youtube:${pathway.slug}`,
        lane: "youtube",
        pathwaySlug: pathway.slug,
        title: `Finish ${pathway.title} YouTube video`,
        priority: pathway.videoProjectReady ? "high" : "medium",
        reason: pathway.videoProjectReady
          ? "The Pathway already has video work staged but is not published on YouTube."
          : "Current approved audio is ready for the YouTube production lane.",
        recipeKey: "audio_to_youtube"
      });
    }
  }

  return tasks.sort((a, b) => {
    const priority = SCORE[a.priority] - SCORE[b.priority];
    if (priority) return priority;
    const aPath = pathways.find((item) => item.slug === a.pathwaySlug)?.campaignRank ?? 9;
    const bPath = pathways.find((item) => item.slug === b.pathwaySlug)?.campaignRank ?? 9;
    if (aPath !== bPath) return aPath - bPath;
    return a.key.localeCompare(b.key);
  });
}

export function selectForgeBatch(tasks: ForgeTask[], input: { lane?: ForgeLane | "all"; limit?: number } = {}) {
  const lane = input.lane ?? "all";
  const limit = Math.max(1, Math.min(5, Math.round(input.limit ?? 2)));
  return tasks.filter((task) => lane === "all" || task.lane === lane).slice(0, limit);
}

export function summarizeForgeQueue(tasks: ForgeTask[]) {
  return {
    total: tasks.length,
    audio: tasks.filter((task) => task.lane === "audio").length,
    carousel: tasks.filter((task) => task.lane === "carousel").length,
    youtube: tasks.filter((task) => task.lane === "youtube").length,
    highOrUrgent: tasks.filter((task) => task.priority === "high" || task.priority === "urgent").length
  };
}

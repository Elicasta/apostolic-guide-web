export type PathwayVideoPublishingMetadata = {
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeTags: string[];
  youtubeHashtags: string[];
  shortsTitle: string;
  reelCaption: string;
  tiktokCaption: string;
  socialHashtags: string[];
  seoKeywords: string[];
  thumbnailText: string;
  thumbnailSubline: string;
  thumbnailVisualBrief: string;
  thumbnailImagePrompt: string;
};

export const EMPTY_PATHWAY_VIDEO_PUBLISHING_METADATA: PathwayVideoPublishingMetadata = {
  youtubeTitle: "",
  youtubeDescription: "",
  youtubeTags: [],
  youtubeHashtags: [],
  shortsTitle: "",
  reelCaption: "",
  tiktokCaption: "",
  socialHashtags: [],
  seoKeywords: [],
  thumbnailText: "",
  thumbnailSubline: "",
  thumbnailVisualBrief: "",
  thumbnailImagePrompt: ""
};

function cleanList(value: unknown, max = 30) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizePathwayVideoPublishingMetadata(value: unknown): PathwayVideoPublishingMetadata {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    youtubeTitle: cleanString(source.youtubeTitle, 100),
    youtubeDescription: cleanString(source.youtubeDescription, 5000),
    youtubeTags: cleanList(source.youtubeTags, 30),
    youtubeHashtags: cleanList(source.youtubeHashtags, 8),
    shortsTitle: cleanString(source.shortsTitle, 100),
    reelCaption: cleanString(source.reelCaption, 2200),
    tiktokCaption: cleanString(source.tiktokCaption, 2200),
    socialHashtags: cleanList(source.socialHashtags, 12),
    seoKeywords: cleanList(source.seoKeywords, 30),
    thumbnailText: cleanString(source.thumbnailText, 64),
    thumbnailSubline: cleanString(source.thumbnailSubline, 100),
    thumbnailVisualBrief: cleanString(source.thumbnailVisualBrief, 1200),
    thumbnailImagePrompt: cleanString(source.thumbnailImagePrompt, 1800)
  };
}

export const PATHWAY_VIDEO_PUBLISHING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "youtubeTitle",
    "youtubeDescription",
    "youtubeTags",
    "youtubeHashtags",
    "shortsTitle",
    "reelCaption",
    "tiktokCaption",
    "socialHashtags",
    "seoKeywords",
    "thumbnailText",
    "thumbnailSubline",
    "thumbnailVisualBrief",
    "thumbnailImagePrompt"
  ],
  properties: {
    youtubeTitle: { type: "string", maxLength: 100 },
    youtubeDescription: { type: "string", maxLength: 5000 },
    youtubeTags: { type: "array", maxItems: 30, items: { type: "string" } },
    youtubeHashtags: { type: "array", maxItems: 8, items: { type: "string" } },
    shortsTitle: { type: "string", maxLength: 100 },
    reelCaption: { type: "string", maxLength: 2200 },
    tiktokCaption: { type: "string", maxLength: 2200 },
    socialHashtags: { type: "array", maxItems: 12, items: { type: "string" } },
    seoKeywords: { type: "array", maxItems: 30, items: { type: "string" } },
    thumbnailText: { type: "string", maxLength: 64 },
    thumbnailSubline: { type: "string", maxLength: 100 },
    thumbnailVisualBrief: { type: "string", maxLength: 1200 },
    thumbnailImagePrompt: { type: "string", maxLength: 1800 }
  }
} as const;

import type { VideoProducerCut, VideoProducerOutputRange } from "./video-producer";
import { mapSourceRangeToOutputRanges } from "./video-producer";

export type VideoProducerVisualRecommendation =
  | "a-roll"
  | "punch-in"
  | "camera-b"
  | "scripture"
  | "graphic"
  | "b-roll";

export type VideoProducerVisualProvider =
  | "ag-library"
  | "pexels"
  | "pixabay"
  | "runway"
  | "firefly"
  | "upload";

export type VideoProducerVisualVocabulary =
  | "scripture"
  | "god-eternity"
  | "incarnation"
  | "history"
  | "debate-argument"
  | "humanity"
  | "church-life"
  | "abstract-editorial";

export type VideoProducerVisualBeatStatus = "open" | "searching" | "resolved" | "skipped";

export type VideoProducerVisualBeat = {
  id: string;
  projectId: string;
  sourceStart: number;
  duration: number;
  dialogue: string;
  recommendation: VideoProducerVisualRecommendation;
  intent: string;
  searchQueries: string[];
  vocabulary: VideoProducerVisualVocabulary;
  preferredStyle?: string;
  avoid: string[];
  status: VideoProducerVisualBeatStatus;
  source: "sol" | "manual";
  revision: number;
};

export type VideoProducerVisualCandidate = {
  id: string;
  beatId: string;
  provider: VideoProducerVisualProvider;
  providerAssetId?: string | null;
  title: string;
  previewUrl?: string | null;
  sourceUrl?: string | null;
  downloadUrl?: string | null;
  creator?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  score?: number | null;
  licenseName?: string | null;
  licenseUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export type VideoProducerVisualAsset = {
  id: string;
  sourceProvider: VideoProducerVisualProvider;
  providerAssetId?: string | null;
  sourceUrl?: string | null;
  creator?: string | null;
  licenseName?: string | null;
  licenseUrl?: string | null;
  licenseSnapshot?: string | null;
  retrievedAt: string;
  storageProvider: "vercel_blob";
  storageLocator: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  tags: string[];
  description?: string | null;
  generationPrompt?: string | null;
  generationModel?: string | null;
  reusable: boolean;
  rightsFlags?: Record<string, boolean>;
  revision: number;
};

export type VideoProducerVisualPlacement = {
  id: string;
  projectId: string;
  beatId: string;
  assetId: string;
  sourceStart: number;
  sourceEnd: number;
  assetIn: number;
  assetOut: number;
  fit: "cover" | "contain";
  positionX: number;
  positionY: number;
  scale: number;
  layer: number;
  audioEnabled: boolean;
  source: "auto" | "manual";
  locked: boolean;
  revision: number;
};

export type VideoProducerCompiledVisualPlacement = VideoProducerVisualPlacement & {
  outputRanges: VideoProducerOutputRange[];
};

export type VideoProducerLicenseManifestEntry = {
  file: string;
  provider: VideoProducerVisualProvider;
  assetId: string | null;
  creator: string | null;
  sourceUrl: string | null;
  retrievedAt: string;
  license: string | null;
  licenseUrl: string | null;
  licenseSnapshot: string | null;
  sha256: string | null;
  projectId: string;
  beatId: string;
};

export type VideoProducerPremiereAssembly = {
  version: 1;
  projectId: string;
  generatedAt: string;
  bins: {
    aroll: "01_AROLL";
    brollStock: "02_BROLL/STOCK";
    brollAi: "02_BROLL/AI";
    graphics: "03_GRAPHICS";
    audio: "04_AUDIO";
    project: "05_PROJECT";
    exports: "06_EXPORTS";
  };
  placements: Array<{
    placementId: string;
    beatId: string;
    assetId: string;
    storageLocator: string;
    filename: string;
    provider: VideoProducerVisualProvider;
    sourceStart: number;
    sourceEnd: number;
    assetIn: number;
    assetOut: number;
    layer: number;
    audioEnabled: false;
  }>;
};

export const VIDEO_PRODUCER_VISUAL_VOCABULARY: Record<VideoProducerVisualVocabulary, {
  searchTerms: string[];
  generationLanguage: string[];
}> = {
  scripture: {
    searchTerms: ["Bible macro", "paper", "ink", "pages", "highlighting", "writing", "ancient manuscript", "printing press", "books"],
    generationLanguage: ["archival paper", "black ink", "book detail", "paper fibers", "documentary macro"]
  },
  "god-eternity": {
    searchTerms: ["sky", "cloud formations", "ocean", "stars", "light", "darkness", "abstract scale"],
    generationLanguage: ["natural scale", "light and darkness", "atmospheric abstraction", "restrained cosmic detail"]
  },
  incarnation: {
    searchTerms: ["human hands", "breathing", "skin detail", "fabric", "body detail", "heartbeat", "human silhouette"],
    generationLanguage: ["human detail", "skin", "fabric", "breath", "tactile physicality", "no biblical reenactment"]
  },
  history: {
    searchTerms: ["old church architecture", "stone", "Jerusalem", "maps", "manuscripts", "historical documents", "archival photography"],
    generationLanguage: ["historical texture", "stone architecture", "map detail", "archival document", "documentary insert"]
  },
  "debate-argument": {
    searchTerms: ["text", "diagram", "highlight", "comparison", "quotation", "split screen", "timeline"],
    generationLanguage: ["prefer graphic over B-roll", "clean evidence", "comparison", "timeline", "document detail"]
  },
  humanity: {
    searchTerms: ["hands", "face detail", "breathing", "walking", "human texture", "daily life"],
    generationLanguage: ["observational human detail", "natural movement", "documentary restraint"]
  },
  "church-life": {
    searchTerms: ["church pew", "Bible study", "congregation", "prayer hands", "church interior", "worship detail"],
    generationLanguage: ["real church detail", "documentary church life", "natural light", "unposed"]
  },
  "abstract-editorial": {
    searchTerms: ["ink in water", "dust light", "paper texture", "shadow movement", "glass refraction", "macro texture"],
    generationLanguage: ["editorial insert", "abstract physical texture", "controlled motion", "cinematic fragment"]
  }
};

const BIBLE_MOVIE_PATTERNS = [
  /\bjesus\b.*\b(walking|standing|mountain|jerusalem|desert|crowd)/i,
  /\bmoses\b/i,
  /\bisraelites?\b/i,
  /\bapostles?\b.*\bwalking|gathered|boat|road/i,
  /\bglowing bible\b/i,
  /\bcross silhouette\b/i,
  /\bbiblical reenactment\b/i,
  /\bancient (?:hebrews?|jews?|people)\b.*\bwalking|camp|desert/i
];

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, finite(value, min)));
}

export function visualPromptLooksLikeBibleMovie(prompt: string) {
  return BIBLE_MOVIE_PATTERNS.some((pattern) => pattern.test(prompt));
}

export function normalizeVisualSearchQueries(values: unknown, max = 6) {
  if (!Array.isArray(values)) return [] as string[];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const query = value.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(query);
    if (result.length >= max) break;
  }
  return result;
}

export function normalizeVisualAvoid(values: unknown, max = 12) {
  if (!Array.isArray(values)) return [] as string[];
  return [...new Set(values.flatMap((value) => typeof value === "string" ? [value.replace(/\s+/g, " ").trim().slice(0, 100)] : []).filter(Boolean))].slice(0, max);
}

export function buildEditorialGenerationPrompt(input: {
  beat: Pick<VideoProducerVisualBeat, "intent" | "dialogue" | "vocabulary" | "preferredStyle" | "avoid">;
  mode: "podcast" | "reels";
  imageToVideo?: boolean;
}) {
  const vocabulary = VIDEO_PRODUCER_VISUAL_VOCABULARY[input.beat.vocabulary];
  const duration = input.mode === "reels" ? "3-4 seconds" : "4-5 seconds";
  const preferred = input.beat.preferredStyle?.trim() || "documentary editorial cinematography";
  const motion = input.imageToVideo
    ? "Motion only: very slow push or lateral drift, subtle environmental movement, no camera shake. Preserve the source composition."
    : "One contained visual fragment with simple controlled motion. No plot, no performance, no scene coverage.";
  const avoid = [
    "actors portraying Jesus, Moses, apostles, prophets, or biblical characters",
    "Bible-movie reenactment",
    "glowing Bible",
    "cross silhouette at sunset",
    "fantasy light beams",
    "AI-looking faces or hands",
    "visible generated text",
    ...input.beat.avoid
  ];
  return [
    `Create a ${duration} Apostolic Guide editorial insert.`,
    `Editorial intent: ${input.beat.intent}.`,
    `Visual language: ${preferred}; ${vocabulary.generationLanguage.join(", ")}.`,
    motion,
    "Use realistic optics, restrained natural color, tactile detail, and believable physical light. Prefer macro, texture, architecture, documents, hands, atmosphere, or abstract physical phenomena over literal storytelling.",
    `Do not include: ${normalizeVisualAvoid(avoid).join(", ")}.`
  ].join(" ");
}

export function compileVideoProducerVisualPlacements(
  placements: VideoProducerVisualPlacement[],
  cuts: VideoProducerCut[],
  duration: number
): VideoProducerCompiledVisualPlacement[] {
  return placements
    .filter((placement) => placement.sourceEnd > placement.sourceStart && placement.assetOut > placement.assetIn)
    .map((placement) => ({
      ...placement,
      sourceStart: clamp(placement.sourceStart, 0, duration),
      sourceEnd: clamp(placement.sourceEnd, 0, duration),
      assetIn: Math.max(0, finite(placement.assetIn)),
      assetOut: Math.max(0, finite(placement.assetOut)),
      positionX: clamp(placement.positionX, 0, 1),
      positionY: clamp(placement.positionY, 0, 1),
      scale: clamp(placement.scale, 0.25, 4),
      layer: Math.max(2, Math.floor(finite(placement.layer, 2))),
      audioEnabled: false as const,
      outputRanges: mapSourceRangeToOutputRanges(placement.sourceStart, placement.sourceEnd, cuts, duration)
    }))
    .filter((placement) => placement.sourceEnd > placement.sourceStart && placement.outputRanges.length > 0);
}

export function videoProducerVisualFingerprintInput(input: {
  placements: VideoProducerVisualPlacement[];
  assets: VideoProducerVisualAsset[];
}) {
  const assets = new Map(input.assets.map((asset) => [asset.id, asset]));
  return input.placements
    .map((placement) => {
      const asset = assets.get(placement.assetId);
      return {
        placementId: placement.id,
        placementRevision: placement.revision,
        beatId: placement.beatId,
        assetId: placement.assetId,
        assetRevision: asset?.revision ?? 0,
        assetSha256: asset?.sha256 ?? null,
        sourceStart: placement.sourceStart,
        sourceEnd: placement.sourceEnd,
        assetIn: placement.assetIn,
        assetOut: placement.assetOut,
        fit: placement.fit,
        positionX: placement.positionX,
        positionY: placement.positionY,
        scale: placement.scale,
        layer: placement.layer,
        locked: placement.locked
      };
    })
    .sort((a, b) => a.sourceStart - b.sourceStart || a.layer - b.layer || a.placementId.localeCompare(b.placementId));
}

export function buildVideoProducerLicenseManifest(input: {
  projectId: string;
  placements: VideoProducerVisualPlacement[];
  assets: VideoProducerVisualAsset[];
}) {
  const assets = new Map(input.assets.map((asset) => [asset.id, asset]));
  return input.placements.flatMap((placement): VideoProducerLicenseManifestEntry[] => {
    const asset = assets.get(placement.assetId);
    if (!asset) return [];
    return [{
      file: asset.filename,
      provider: asset.sourceProvider,
      assetId: asset.providerAssetId ?? null,
      creator: asset.creator ?? null,
      sourceUrl: asset.sourceUrl ?? null,
      retrievedAt: asset.retrievedAt,
      license: asset.licenseName ?? null,
      licenseUrl: asset.licenseUrl ?? null,
      licenseSnapshot: asset.licenseSnapshot ?? null,
      sha256: asset.sha256 ?? null,
      projectId: input.projectId,
      beatId: placement.beatId
    }];
  });
}

export function buildVideoProducerPremiereAssembly(input: {
  projectId: string;
  placements: VideoProducerVisualPlacement[];
  assets: VideoProducerVisualAsset[];
  generatedAt?: string;
}): VideoProducerPremiereAssembly {
  const assets = new Map(input.assets.map((asset) => [asset.id, asset]));
  return {
    version: 1,
    projectId: input.projectId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    bins: {
      aroll: "01_AROLL",
      brollStock: "02_BROLL/STOCK",
      brollAi: "02_BROLL/AI",
      graphics: "03_GRAPHICS",
      audio: "04_AUDIO",
      project: "05_PROJECT",
      exports: "06_EXPORTS"
    },
    placements: input.placements.flatMap((placement) => {
      const asset = assets.get(placement.assetId);
      if (!asset) return [];
      return [{
        placementId: placement.id,
        beatId: placement.beatId,
        assetId: asset.id,
        storageLocator: asset.storageLocator,
        filename: asset.filename,
        provider: asset.sourceProvider,
        sourceStart: placement.sourceStart,
        sourceEnd: placement.sourceEnd,
        assetIn: placement.assetIn,
        assetOut: placement.assetOut,
        layer: placement.layer,
        audioEnabled: false as const
      }];
    })
  };
}

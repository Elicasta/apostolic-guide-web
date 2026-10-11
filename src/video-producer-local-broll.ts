import type { VideoProducerCut } from "./video-producer";
import {
  compileVideoProducerVisualPlacements,
  normalizeVisualSearchQueries,
  visualBeatDirectionLooksLikeBibleMovie,
  type VideoProducerCompiledVisualPlacement,
  type VideoProducerVisualBeat,
  type VideoProducerVisualPlacement
} from "./video-producer-visuals";

/** Matches the Finish panel automatic-selection threshold. */
export const LOCAL_BROLL_AUTO_MIN_SCORE = 84;

export type LocalVisualRecord = {
  id: string;
  filename: string;
  description?: string | null;
  tags?: string[];
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  updatedAt?: string | null;
  localPath?: string | null;
  sourceUrl?: string | null;
  creator?: string | null;
  licenseName?: string | null;
  licenseUrl?: string | null;
  storageLocator?: string | null;
  sha256?: string | null;
  revision?: number | null;
};

export type RankedLocalVisual = {
  asset: LocalVisualRecord;
  matchedTerms: number;
  score: number;
};

export type LocalBrollSelection = {
  beatId: string;
  assetId: string;
  score: number;
  matchedTerms: number;
  placement: VideoProducerCompiledVisualPlacement;
};

function termsForQueries(queries: string[]) {
  return normalizeVisualSearchQueries(queries, 8)
    .flatMap((query) => query.toLowerCase().split(/\s+/).filter((term) => term.length >= 3));
}

function haystackFor(asset: LocalVisualRecord) {
  return [asset.filename, asset.description, ...(asset.tags ?? [])]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

export function rankLocalVisualLibrary(
  assets: LocalVisualRecord[],
  queries: string[],
  limit = 6
): RankedLocalVisual[] {
  const bounded = Math.min(12, Math.max(1, limit));
  const terms = termsForQueries(queries);
  return assets
    .map((asset) => {
      const haystack = haystackFor(asset);
      const matchedTerms = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { asset, matchedTerms };
    })
    .filter((row) => row.matchedTerms > 0 || terms.length === 0)
    .sort((a, b) => b.matchedTerms - a.matchedTerms || String(b.asset.updatedAt ?? "").localeCompare(String(a.asset.updatedAt ?? "")))
    .slice(0, bounded)
    .map((row, index) => ({
      asset: row.asset,
      matchedTerms: row.matchedTerms,
      score: Math.min(100, 96 + row.matchedTerms - index)
    }));
}

export function provisionalVisualRange(
  beat: { sourceStart: number; duration: number },
  sourceDuration: number
) {
  const start = Math.max(0, Number(beat.sourceStart) - 0.35);
  const desired = Math.min(8, Math.max(1.5, Number(beat.duration)));
  const end = Math.min(Math.max(0, sourceDuration), start + desired);
  return { start, end, duration: Math.max(0.5, end - start) };
}

export function localAssetWindow(assetDuration: number | null | undefined, rangeDuration: number) {
  const duration = Number(assetDuration || rangeDuration);
  const assetIn = duration > rangeDuration + 2 ? Math.min(2, duration * 0.1) : 0;
  const assetOut = Math.min(duration, assetIn + rangeDuration);
  return { assetIn, assetOut, visible: Math.max(0.5, assetOut - assetIn) };
}

export function selectedAssetIn(assetDuration: number | null | undefined, rangeDuration: number) {
  const duration = Number(assetDuration || 0);
  return duration > rangeDuration + 2 ? Math.min(2, duration * 0.1) : 0;
}

function beatQueries(beat: VideoProducerVisualBeat) {
  if (beat.searchQueries.length) return beat.searchQueries;
  return [beat.dialogue, beat.intent].map((value) => value.trim()).filter(Boolean);
}

export function assembleLocalBrollTimeline(input: {
  projectId: string;
  sourceDuration: number;
  beats: VideoProducerVisualBeat[];
  library: LocalVisualRecord[];
  cuts?: VideoProducerCut[];
  minScore?: number;
}) {
  const minScore = input.minScore ?? LOCAL_BROLL_AUTO_MIN_SCORE;
  const broll = input.beats
    .filter((beat) => beat.recommendation === "b-roll" && beat.status !== "skipped")
    .sort((a, b) => a.sourceStart - b.sourceStart || a.id.localeCompare(b.id));
  const draft: VideoProducerVisualPlacement[] = [];
  const chosen: Array<Omit<LocalBrollSelection, "placement">> = [];
  const unresolvedBeatIds: string[] = [];
  const used = new Set<string>();
  let cursor = 0;

  for (const beat of broll) {
    if (visualBeatDirectionLooksLikeBibleMovie(beat)) {
      unresolvedBeatIds.push(beat.id);
      continue;
    }
    const ranked = rankLocalVisualLibrary(input.library, beatQueries(beat), 8)
      .filter((row) => row.matchedTerms > 0 && row.score >= minScore);
    const choice = ranked.find((row) => !used.has(row.asset.id)) ?? ranked[0];
    if (!choice) {
      unresolvedBeatIds.push(beat.id);
      continue;
    }
    const range = provisionalVisualRange(beat, input.sourceDuration);
    const window = localAssetWindow(choice.asset.duration, range.duration);
    const sourceStart = Math.max(range.start, cursor);
    const sourceEnd = Math.min(input.sourceDuration, sourceStart + window.visible);
    if (sourceEnd - sourceStart < 0.5) {
      unresolvedBeatIds.push(beat.id);
      continue;
    }
    used.add(choice.asset.id);
    cursor = sourceEnd;
    const visible = sourceEnd - sourceStart;
    draft.push({
      id: `placement-${beat.id}`,
      projectId: input.projectId,
      beatId: beat.id,
      assetId: choice.asset.id,
      sourceStart,
      sourceEnd,
      assetIn: window.assetIn,
      assetOut: window.assetIn + visible,
      fit: "cover",
      positionX: 0.5,
      positionY: 0.5,
      scale: 1,
      layer: 2,
      audioEnabled: false,
      source: "auto",
      locked: false,
      revision: 1
    });
    chosen.push({
      beatId: beat.id,
      assetId: choice.asset.id,
      score: choice.score,
      matchedTerms: choice.matchedTerms
    });
  }

  const placements = compileVideoProducerVisualPlacements(draft, input.cuts ?? [], input.sourceDuration);
  const placed = new Set(placements.map((placement) => placement.beatId));
  for (const item of chosen) {
    if (!placed.has(item.beatId)) unresolvedBeatIds.push(item.beatId);
  }
  return {
    selections: chosen.flatMap((item) => {
      const placement = placements.find((candidate) => candidate.beatId === item.beatId);
      return placement ? [{ ...item, placement }] : [];
    }),
    unresolvedBeatIds,
    placements
  };
}

export function localBrollOutputSpans(placements: VideoProducerCompiledVisualPlacement[]) {
  return placements.flatMap((placement) => placement.outputRanges.map((range) => ({
    beatId: placement.beatId,
    assetId: placement.assetId,
    outputStart: range.outputStart,
    outputEnd: range.outputEnd,
    assetIn: placement.assetIn + (range.sourceStart - placement.sourceStart)
  })));
}

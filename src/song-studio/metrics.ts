import { SONG_SCORE_KEYS, type SongGateStatus, type SongMechanics, type SongScoreKey, type SongScores } from "./types";

export const SONG_SCORE_WEIGHTS: Record<SongScoreKey, number> = {
  doctrinal_fidelity: 0.16,
  scripture_grounding: 0.11,
  christ_centeredness: 0.09,
  oneness_integrity: 0.15,
  biblical_language: 0.09,
  congregational_singability: 0.11,
  hook_memorability: 0.07,
  lyrical_originality: 0.07,
  worship_orientation: 0.06,
  cliche_resistance: 0.04,
  structural_cohesion: 0.03,
  suno_readiness: 0.02
};

export const SONG_HARD_GATES: Partial<Record<SongScoreKey, number>> = {
  doctrinal_fidelity: 92,
  oneness_integrity: 92,
  biblical_language: 84,
  congregational_singability: 72,
  worship_orientation: 72
};

const CLICHES = [
  "through the storm",
  "mountains move",
  "break every chain",
  "chains fall",
  "never let me go",
  "set me on fire",
  "oceans rise",
  "from the ashes",
  "walls come down",
  "darkest night"
];

const SYSTEMATIC_JARGON = [
  "modalism",
  "modalist",
  "trinitarian",
  "trinity",
  "three persons",
  "one person",
  "divine persons",
  "modes of god",
  "manifestations of god"
];

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeSongScores(input: Partial<SongScores>): SongScores {
  return Object.fromEntries(SONG_SCORE_KEYS.map((key) => [key, clampScore(input[key] ?? 0)])) as SongScores;
}

export function calculateSongOverallScore(scores: SongScores) {
  const normalized = normalizeSongScores(scores);
  return Math.round(SONG_SCORE_KEYS.reduce((sum, key) => sum + normalized[key] * SONG_SCORE_WEIGHTS[key], 0));
}

export function failedSongGates(scores: SongScores) {
  const normalized = normalizeSongScores(scores);
  return Object.entries(SONG_HARD_GATES)
    .filter(([key, threshold]) => normalized[key as SongScoreKey] < Number(threshold))
    .map(([key, threshold]) => ({
      key: key as SongScoreKey,
      score: normalized[key as SongScoreKey],
      threshold: Number(threshold)
    }));
}

export function determineSongGateStatus(scores: SongScores): SongGateStatus {
  if (failedSongGates(scores).length > 0) return "blocked";
  return calculateSongOverallScore(scores) >= 82 ? "ready_for_suno" : "needs_work";
}

export function parseSongSections(lyrics: string) {
  const sectionHeader = /^\s*\[(verse(?:\s+\d+)?|chorus|pre-chorus|prechorus|bridge|tag|intro|outro|refrain|vamp)\]\s*$/i;
  const lines = lyrics.replace(/\r/g, "").split("\n");
  const sections: Array<{ name: string; lines: string[] }> = [];
  let current = { name: "unlabeled", lines: [] as string[] };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(sectionHeader);
    if (match) {
      if (current.lines.length || current.name !== "unlabeled") sections.push(current);
      current = { name: match[1].toLowerCase().replace("prechorus", "pre-chorus"), lines: [] };
      continue;
    }
    if (line) current.lines.push(line);
  }

  if (current.lines.length || current.name !== "unlabeled") sections.push(current);
  return sections;
}

export function analyzeSongMechanics(lyrics: string): SongMechanics {
  const sections = parseSongSections(lyrics);
  const lyricLines = sections.flatMap((section) => section.lines);
  const wordCounts = lyricLines.map((line) => line.split(/\s+/).filter(Boolean).length);
  const normalizedLines = lyricLines.map((line) => line.toLowerCase().replace(/[^a-z0-9'\s]/g, "").replace(/\s+/g, " ").trim());
  const frequencies = new Map<string, number>();
  for (const line of normalizedLines) {
    if (line) frequencies.set(line, (frequencies.get(line) ?? 0) + 1);
  }
  const repeatedLineCount = [...frequencies.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const lower = lyrics.toLowerCase();
  const clicheHits = CLICHES.filter((phrase) => lower.includes(phrase));
  const jargonHits = SYSTEMATIC_JARGON.filter((phrase) => lower.includes(phrase));
  const chorusLineCount = sections.filter((section) => section.name === "chorus" || section.name === "refrain").reduce((sum, section) => sum + section.lines.length, 0);
  const averageWordsPerLine = wordCounts.length ? Number((wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length).toFixed(1)) : 0;
  const longestLineWords = wordCounts.length ? Math.max(...wordCounts) : 0;
  const warnings: string[] = [];

  if (!sections.some((section) => section.name === "chorus" || section.name === "refrain")) warnings.push("No labeled chorus or refrain was found.");
  if (longestLineWords > 14) warnings.push("At least one lyric line is longer than 14 words and may be hard for a congregation to phrase together.");
  if (averageWordsPerLine > 10) warnings.push("Average lyric lines are dense. Consider shorter phrases for congregational singing.");
  if (clicheHits.length > 1) warnings.push("Multiple common Christian-song phrases were detected. Replace them unless the lyric earns them.");
  if (jargonHits.length > 0) warnings.push("Systematic-theology jargon was detected. Prefer biblical language unless the brief explicitly requires it.");
  if (lyricLines.length > 0 && repeatedLineCount / lyricLines.length > 0.45) warnings.push("The lyric repeats nearly half its lines. Confirm that repetition serves worship rather than filling space.");

  return {
    lineCount: lyricLines.length,
    sectionCount: sections.length,
    chorusLineCount,
    averageWordsPerLine,
    longestLineWords,
    repeatedLineRatio: lyricLines.length ? Number((repeatedLineCount / lyricLines.length).toFixed(2)) : 0,
    clicheHits,
    jargonHits,
    warnings
  };
}

export const SONG_METRIC_LABELS: Record<SongScoreKey, string> = {
  doctrinal_fidelity: "Doctrinal fidelity",
  scripture_grounding: "Scripture grounding",
  christ_centeredness: "Christ centeredness",
  oneness_integrity: "Oneness integrity",
  biblical_language: "Biblical language",
  congregational_singability: "Congregational singability",
  hook_memorability: "Hook memorability",
  lyrical_originality: "Lyrical originality",
  worship_orientation: "Worship orientation",
  cliche_resistance: "Cliche resistance",
  structural_cohesion: "Structural cohesion",
  suno_readiness: "Suno readiness"
};

import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSongMechanics, calculateSongOverallScore, determineSongGateStatus, failedSongGates, SONG_SCORE_WEIGHTS } from "../src/song-studio/metrics";
import type { SongScores } from "../src/song-studio/types";

const strongScores: SongScores = {
  doctrinal_fidelity: 96,
  scripture_grounding: 91,
  christ_centeredness: 96,
  oneness_integrity: 97,
  biblical_language: 94,
  congregational_singability: 90,
  hook_memorability: 88,
  lyrical_originality: 86,
  worship_orientation: 94,
  cliche_resistance: 90,
  structural_cohesion: 90,
  suno_readiness: 88
};

test("song metric weights total 1", () => {
  const total = Object.values(SONG_SCORE_WEIGHTS).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total - 1) < 0.000001);
});

test("a strong song clears the Suno gate", () => {
  assert.equal(determineSongGateStatus(strongScores), "ready_for_suno");
  assert.equal(failedSongGates(strongScores).length, 0);
  assert.ok(calculateSongOverallScore(strongScores) >= 82);
});

test("creative strength cannot override weak doctrinal fidelity", () => {
  const scores = { ...strongScores, doctrinal_fidelity: 91 };
  assert.equal(determineSongGateStatus(scores), "blocked");
  assert.deepEqual(failedSongGates(scores).map((gate) => gate.key), ["doctrinal_fidelity"]);
});

test("creative strength cannot override weak Oneness integrity", () => {
  const scores = { ...strongScores, oneness_integrity: 70, lyrical_originality: 100, hook_memorability: 100 };
  assert.equal(determineSongGateStatus(scores), "blocked");
  assert.ok(failedSongGates(scores).some((gate) => gate.key === "oneness_integrity"));
});

test("passing hard gates can still need work when the weighted score is low", () => {
  const scores: SongScores = {
    ...strongScores,
    scripture_grounding: 30,
    christ_centeredness: 35,
    hook_memorability: 20,
    lyrical_originality: 20,
    cliche_resistance: 20,
    structural_cohesion: 20,
    suno_readiness: 20
  };
  assert.equal(failedSongGates(scores).length, 0);
  assert.equal(determineSongGateStatus(scores), "needs_work");
});

test("mechanical analysis catches dense lines, jargon, and common filler", () => {
  const mechanics = analyzeSongMechanics(`[Verse 1]\nThe Trinity and three persons are words in this intentionally extremely long lyric line that keeps going far beyond what a congregation can comfortably phrase together\nThrough the storm You never let me go\n\n[Chorus]\nJesus You alone are God\nJesus You alone are God`);
  assert.equal(mechanics.sectionCount, 2);
  assert.equal(mechanics.chorusLineCount, 2);
  assert.ok(mechanics.longestLineWords > 14);
  assert.ok(mechanics.jargonHits.includes("trinity"));
  assert.ok(mechanics.jargonHits.includes("three persons"));
  assert.ok(mechanics.clicheHits.includes("through the storm"));
  assert.ok(mechanics.clicheHits.includes("never let me go"));
  assert.ok(mechanics.warnings.length >= 3);
});

test("unlabeled lyrics are still analyzed instead of disappearing", () => {
  const mechanics = analyzeSongMechanics("Jesus You are Lord\nEvery knee will bow");
  assert.equal(mechanics.lineCount, 2);
  assert.equal(mechanics.sectionCount, 1);
  assert.ok(mechanics.warnings.some((warning) => warning.includes("No labeled chorus")));
});

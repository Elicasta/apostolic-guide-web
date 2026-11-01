import assert from "node:assert/strict";
import test from "node:test";
import { EPISODE_01_SCRIPT } from "../src/lib/teleprompter/episodes/episode-01";
import { getEpisodeSeedDocuments } from "../src/lib/teleprompter/episodes";

const scripts = [
  ["Episode 1", EPISODE_01_SCRIPT],
  ...getEpisodeSeedDocuments().map((episode) => [episode.title, episode.content] as const),
] as const;

const defensivePhrases = [
  "Oneness theology",
  "Do Apostolics believe",
  "Apostolics obsess",
  "I think Acts is not a contradiction",
  "I do not think Scripture requires",
  "not an embarrassment to Oneness",
];

test("teleprompter episodes keep Scripture-first posture", () => {
  for (const [title, script] of scripts) {
    for (const phrase of defensivePhrases) {
      assert.equal(
        script.includes(phrase),
        false,
        `${title} drifted back into defensive framing: ${phrase}`,
      );
    }
  }
});

test("teleprompter prose uses short lens-friendly thought lines", () => {
  for (const [title, script] of scripts) {
    const proseLines = script.split("\n").filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !trimmed.startsWith("#") &&
        !trimmed.startsWith(">") &&
        !trimmed.startsWith("@") &&
        trimmed !== "---"
      );
    });

    const longLines = proseLines.filter((line) => line.trim().length > 64);
    assert.deepEqual(longLines, [], `${title} contains long horizontal reading lines`);
  }
});

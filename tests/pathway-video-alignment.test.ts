import assert from "node:assert/strict";
import test from "node:test";
import { allPathways } from "../src/pathway-catalog";
import { alignPathwayVideoTimeline, type TimedTranscriptWord } from "../src/pathway-video-alignment";

function timedWords(text: string): TimedTranscriptWord[] {
  return text.split(/\s+/).filter(Boolean).map((word, index) => ({ word, start: index * 0.62, end: index * 0.62 + 0.48 }));
}

test("approved narration aligns Scripture cues while preserving the rich template", () => {
  const pathway = allPathways.find((item) => item.slug === "jesus-is-god");
  assert.ok(pathway);
  const script = [
    "Who is Jesus Christ? Welcome to Apostolic Guide.",
    "We begin with the promised child in Isaiah 9:6. A child is born and a son is given.",
    "That promise leads naturally to Matthew 1:23, where Jesus is Immanuel, God with us.",
    "John 1:1 takes us to the beginning. The Word was God.",
    "From the identity of the Word, Second Corinthians 5:19 says God was in Christ.",
    "Colossians 2:9 answers that all the fullness of the Godhead dwells bodily in Him.",
    "In John 20:28 Thomas says, My Lord and my God.",
    "You have completed the Jesus Is God Pathway. Continue studying at Apostolic Guide."
  ].join(" ");
  const words = timedWords(script);
  const duration = (words.at(-1)?.end ?? 0) + 1;
  const result = alignPathwayVideoTimeline({ source: pathway, scriptText: script, transcriptWords: words, duration });

  assert.equal(result.matchedScriptureCues, pathway.steps.length);
  assert.equal(result.totalScriptureCues, pathway.steps.length);
  assert.equal(result.confidence, "high");
  assert.equal(result.timeline[0].start, 0);
  assert.equal(result.timeline[0].kind, "question");
  assert.equal(result.timeline[1].kind, "brand");
  assert.equal(result.timeline.filter((cue) => cue.kind === "scripture").length, pathway.steps.length);
  assert.ok(result.timeline.filter((cue) => cue.kind === "statement").length >= pathway.steps.length);
  assert.ok(result.timeline.length >= pathway.steps.length * 2 + 4);
  for (let index = 1; index < result.timeline.length; index += 1) assert.ok(result.timeline[index].start > result.timeline[index - 1].start);
  assert.ok((result.timeline.at(-1)?.start ?? 0) < duration);
});

test("automatic alignment fallback keeps a rich ordered timeline when references are absent", () => {
  const pathway = allPathways[0];
  const script = "Welcome to Apostolic Guide. This narration intentionally omits explicit reference labels. You have completed the Pathway.";
  const words = timedWords(script);
  const result = alignPathwayVideoTimeline({ source: pathway, scriptText: script, transcriptWords: words, duration: 90 });

  assert.equal(result.matchedScriptureCues, 0);
  assert.equal(result.timeline.filter((cue) => cue.kind === "scripture").length, pathway.steps.length);
  assert.ok(result.timeline.length >= pathway.steps.length * 2 + 4);
  assert.equal(result.timeline[0].kind, "question");
  assert.equal(result.timeline.at(-1)?.kind, "cta");
  for (let index = 1; index < result.timeline.length; index += 1) assert.ok(result.timeline[index].start >= result.timeline[index - 1].start);
});

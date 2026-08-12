import assert from "node:assert/strict";
import test from "node:test";
import { allPathways } from "../src/pathway-catalog";
import { activePathwayVideoCue, buildEstimatedPathwayVideoTimeline, formatVideoTimestamp, normalizePathwayVideoTimeline, VIDEO_FORMATS } from "../src/pathway-video";

test("every Pathway can produce a deterministic video timeline", () => {
  for (const pathway of allPathways) {
    const duration = pathway.estimatedMinutes * 60;
    const first = buildEstimatedPathwayVideoTimeline(pathway, duration);
    const second = buildEstimatedPathwayVideoTimeline(pathway, duration);
    assert.deepEqual(first, second, `${pathway.slug} timeline changed between calls`);
    assert.equal(first[0]?.kind, "brand");
    assert.equal(first.at(-1)?.kind, "cta");
    assert.equal(first.length, pathway.steps.length + 2);
    assert.equal(first.filter((cue) => cue.kind === "scripture").length, pathway.steps.length);
    for (let index = 1; index < first.length; index += 1) assert.ok(first[index].start >= first[index - 1].start, `${pathway.slug} cues are not ordered`);
    assert.ok((first.at(-1)?.start ?? duration) < duration, `${pathway.slug} CTA must begin before the audio ends`);
  }
});

test("timeline normalization clamps and sorts cue starts", () => {
  const source = buildEstimatedPathwayVideoTimeline(allPathways[0], 100);
  const edited = source.map((cue, index) => ({ ...cue, start: index === 0 ? 140 : Math.max(0, 90 - index * 8) }));
  const normalized = normalizePathwayVideoTimeline(edited, 100);
  assert.equal(normalized.at(-1)?.start, 100);
  for (let index = 1; index < normalized.length; index += 1) assert.ok(normalized[index].start >= normalized[index - 1].start);
});

test("active cue follows the playhead", () => {
  const cues = buildEstimatedPathwayVideoTimeline(allPathways[0], 120);
  assert.equal(activePathwayVideoCue(cues, 0)?.id, cues[0].id);
  const middle = cues[Math.min(2, cues.length - 1)];
  assert.equal(activePathwayVideoCue(cues, middle.start + .1)?.id, middle.id);
});

test("video export presets stay on the intended aspect ratios", () => {
  assert.deepEqual([VIDEO_FORMATS.youtube.width, VIDEO_FORMATS.youtube.height], [1920, 1080]);
  assert.deepEqual([VIDEO_FORMATS.vertical.width, VIDEO_FORMATS.vertical.height], [1080, 1920]);
  assert.deepEqual([VIDEO_FORMATS.square.width, VIDEO_FORMATS.square.height], [1080, 1080]);
  assert.equal(formatVideoTimestamp(298.56), "4:58");
});

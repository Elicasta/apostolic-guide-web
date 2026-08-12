import assert from "node:assert/strict";
import test from "node:test";
import { concatenateMp3Segments, DEFAULT_TTS_SPEED, MAX_TTS_CHUNK_CHARS, normalizeMp3Segment, PATHWAY_TTS_INSTRUCTIONS, resolveTtsSpeed, splitNarrationForTts } from "../src/pathway-audio-render";

test("long narration splits into smaller TTS-safe teaching chunks at natural boundaries", () => {
  const paragraph = "Jesus Christ is the full revelation of the invisible God. The Father dwells in the Son, and all the fullness of deity dwells bodily in Him.";
  const narration = Array.from({ length: 45 }, (_, index) => `${paragraph} Section ${index + 1}.`).join("\n\n");
  const chunks = splitNarrationForTts(narration);

  assert.equal(MAX_TTS_CHUNK_CHARS, 1800);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= MAX_TTS_CHUNK_CHARS));
  assert.match(chunks[0], /Jesus Christ is the full revelation/i);
  assert.match(chunks.at(-1) ?? "", /Section 45\./);
});

test("an oversized paragraph is split without exceeding the speech input limit", () => {
  const sentence = "The one God was present and working in Christ, reconciling the world unto himself.";
  const narration = Array.from({ length: 120 }, () => sentence).join(" ");
  const chunks = splitNarrationForTts(narration);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= MAX_TTS_CHUNK_CHARS));
  assert.ok(chunks.every((chunk) => chunk.trim().length > 0));
});

test("Pathway TTS defaults to an unhurried teaching pace", () => {
  assert.equal(DEFAULT_TTS_SPEED, 0.88);
  assert.equal(resolveTtsSpeed(undefined), 0.88);
  assert.equal(resolveTtsSpeed("0.92"), 0.92);
  assert.equal(resolveTtsSpeed("not-a-number"), 0.88);
  assert.match(PATHWAY_TTS_INSTRUCTIONS, /Pause briefly after rhetorical questions/i);
  assert.match(PATHWAY_TTS_INSTRUCTIONS, /Scripture quotations extra space/i);
  assert.match(PATHWAY_TTS_INSTRUCTIONS, /paragraph changes and major transitions as real breathing points/i);
  assert.match(PATHWAY_TTS_INSTRUCTIONS, /flat, mechanical, rushed/i);
});

function fakeMp3Frame(withVbrMarker = false) {
  const frame = Buffer.alloc(417);
  frame.writeUInt32BE(0xfffb9000, 0); // MPEG-1 Layer III, 128kbps, 44.1kHz
  if (withVbrMarker) frame.write("Xing", 36, "ascii");
  else frame.fill(0x33, 4);
  return frame;
}

test("MP3 assembly removes per-segment metadata and stale VBR header frames", () => {
  const id3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const id3v1 = Buffer.concat([Buffer.from("TAG", "ascii"), Buffer.alloc(125)]);
  const audioFrame = fakeMp3Frame(false);
  const segment = Buffer.concat([id3, fakeMp3Frame(true), audioFrame, id3v1]);

  const normalized = normalizeMp3Segment(segment);
  assert.equal(normalized.length, audioFrame.length);
  assert.deepEqual(normalized, audioFrame);

  const combined = concatenateMp3Segments([segment, segment]);
  assert.equal(combined.length, audioFrame.length * 2);
  assert.deepEqual(combined.subarray(0, audioFrame.length), audioFrame);
  assert.deepEqual(combined.subarray(audioFrame.length), audioFrame);
});

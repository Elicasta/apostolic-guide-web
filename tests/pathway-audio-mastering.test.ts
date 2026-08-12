import assert from "node:assert/strict";
import test from "node:test";
import { masterPathwayPcm16Mono, PATHWAY_MASTERING_PROFILE, PATHWAY_MASTERING_SETTINGS } from "../src/pathway-audio-mastering";

const SAMPLE_RATE = 24_000;

function sinePcm(frequency: number, amplitude: number, seconds = 1) {
  const sampleCount = Math.round(SAMPLE_RATE * seconds);
  const pcm = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const value = amplitude * Math.sin(2 * Math.PI * frequency * index / SAMPLE_RATE);
    pcm.writeInt16LE(Math.round(value * 32767), index * 2);
  }
  return pcm;
}

function compositePcm(frequencies: number[], amplitudePerTone: number, seconds = 1) {
  const sampleCount = Math.round(SAMPLE_RATE * seconds);
  const pcm = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    let value = 0;
    for (const frequency of frequencies) value += amplitudePerTone * Math.sin(2 * Math.PI * frequency * index / SAMPLE_RATE);
    value = Math.max(-0.95, Math.min(0.95, value));
    pcm.writeInt16LE(Math.round(value * 32767), index * 2);
  }
  return pcm;
}

function componentMagnitude(pcm: Buffer, frequency: number) {
  const samples = pcm.length / 2;
  let sinProjection = 0;
  let cosProjection = 0;
  for (let index = 0; index < samples; index += 1) {
    const value = pcm.readInt16LE(index * 2) / 32768;
    const phase = 2 * Math.PI * frequency * index / SAMPLE_RATE;
    sinProjection += value * Math.sin(phase);
    cosProjection += value * Math.cos(phase);
  }
  return (2 / samples) * Math.hypot(sinProjection, cosProjection);
}

test("Pathway mastering uses the gentle Cedar warm profile", () => {
  assert.equal(PATHWAY_MASTERING_PROFILE, "cedar-warm-v1");
  assert.equal(PATHWAY_MASTERING_SETTINGS.highShelfGainDb, -1.25);
  assert.equal(PATHWAY_MASTERING_SETTINGS.deEsserMaxReductionDb, 2.5);
  assert.equal(PATHWAY_MASTERING_SETTINGS.compressorRatio, 1.7);
  assert.equal(PATHWAY_MASTERING_SETTINGS.peakCeilingDb, -1);
});

test("mastering preserves 16-bit PCM framing and keeps peaks under the ceiling", () => {
  const mastered = masterPathwayPcm16Mono(sinePcm(1_000, 0.98));
  assert.equal(mastered.length % 2, 0);

  let peak = 0;
  for (let offset = 0; offset < mastered.length; offset += 2) peak = Math.max(peak, Math.abs(mastered.readInt16LE(offset)));
  const ceiling = 32768 * (10 ** (PATHWAY_MASTERING_SETTINGS.peakCeilingDb / 20));
  assert.ok(peak <= ceiling + 2, `peak ${peak} exceeded ceiling ${ceiling}`);
});

test("mastering gently reduces high-frequency energy relative to the voice midrange", () => {
  const source = compositePcm([1_000, 8_000], 0.22);
  const mastered = masterPathwayPcm16Mono(source);

  const beforeRatio = componentMagnitude(source, 8_000) / componentMagnitude(source, 1_000);
  const afterRatio = componentMagnitude(mastered, 8_000) / componentMagnitude(mastered, 1_000);

  assert.ok(afterRatio < beforeRatio * 0.94, `expected high/mid ratio ${afterRatio} to be lower than ${beforeRatio}`);
  assert.ok(afterRatio > beforeRatio * 0.45, "mastering should remain subtle rather than low-pass the voice");
});

test("mastering rejects empty and incomplete PCM", () => {
  assert.throws(() => masterPathwayPcm16Mono(Buffer.alloc(0)), /empty/i);
  assert.throws(() => masterPathwayPcm16Mono(Buffer.from([0x01])), /complete 16-bit samples/i);
});

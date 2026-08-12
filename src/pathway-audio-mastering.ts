export const PATHWAY_MASTERING_PROFILE = "cedar-warm-v1";

export const PATHWAY_MASTERING_SETTINGS = {
  deEsserCutoffHz: 4_500,
  deEsserThresholdDb: -30,
  deEsserMaxReductionDb: 2.5,
  deEsserAttackMs: 3,
  deEsserReleaseMs: 65,
  highShelfCutoffHz: 5_500,
  highShelfGainDb: -1.25,
  compressorThresholdDb: -14,
  compressorRatio: 1.7,
  compressorAttackMs: 12,
  compressorReleaseMs: 120,
  targetActiveRmsDb: -20,
  activeFloorDb: -45,
  maxMakeupGainDb: 3,
  peakCeilingDb: -1
} as const;

function dbToLinear(db: number) {
  return 10 ** (db / 20);
}

function linearToDb(value: number) {
  return 20 * Math.log10(Math.max(value, 1e-9));
}

function smoothingCoefficient(milliseconds: number, sampleRate: number) {
  const samples = Math.max(1, milliseconds * sampleRate / 1000);
  return 1 - Math.exp(-1 / samples);
}

function lowPassCoefficient(cutoffHz: number, sampleRate: number) {
  const safeCutoff = Math.min(cutoffHz, sampleRate * 0.45);
  return 1 - Math.exp(-2 * Math.PI * safeCutoff / sampleRate);
}

function decodePcm16Mono(pcm: Buffer) {
  if (!pcm.length) throw new Error("PCM audio is empty.");
  if (pcm.length % 2 !== 0) throw new Error("PCM audio did not contain complete 16-bit samples.");
  const samples = new Float64Array(pcm.length / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = pcm.readInt16LE(index * 2) / 32768;
  }
  return samples;
}

function encodePcm16Mono(samples: Float64Array) {
  const output = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    const encoded = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, encoded)), index * 2);
  }
  return output;
}

/**
 * A deliberately light mastering pass for spoken Pathway narration.
 *
 * Order:
 * 1. Dynamic de-essing above ~4.5 kHz.
 * 2. Gentle high-frequency shelf reduction above ~5.5 kHz.
 * 3. Slow, low-ratio voice compression.
 * 4. Active-speech RMS normalization with a hard peak ceiling.
 *
 * This stays entirely in PCM so the lossless WAV path never introduces an
 * intermediate codec generation.
 */
export function masterPathwayPcm16Mono(pcm: Buffer, sampleRate = 24_000) {
  const input = decodePcm16Mono(pcm);
  const processed = new Float64Array(input.length);

  const deEsserLowPassAlpha = lowPassCoefficient(PATHWAY_MASTERING_SETTINGS.deEsserCutoffHz, sampleRate);
  const shelfLowPassAlpha = lowPassCoefficient(PATHWAY_MASTERING_SETTINGS.highShelfCutoffHz, sampleRate);
  const deEsserAttack = smoothingCoefficient(PATHWAY_MASTERING_SETTINGS.deEsserAttackMs, sampleRate);
  const deEsserRelease = smoothingCoefficient(PATHWAY_MASTERING_SETTINGS.deEsserReleaseMs, sampleRate);
  const compressorAttack = smoothingCoefficient(PATHWAY_MASTERING_SETTINGS.compressorAttackMs, sampleRate);
  const compressorRelease = smoothingCoefficient(PATHWAY_MASTERING_SETTINGS.compressorReleaseMs, sampleRate);
  const shelfGain = dbToLinear(PATHWAY_MASTERING_SETTINGS.highShelfGainDb);
  const deEsserThreshold = dbToLinear(PATHWAY_MASTERING_SETTINGS.deEsserThresholdDb);
  const compressorThreshold = dbToLinear(PATHWAY_MASTERING_SETTINGS.compressorThresholdDb);

  let deEsserLow = 0;
  let deEsserEnvelope = 0;
  let shelfLow = 0;
  let compressorEnvelope = 0;

  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index];

    deEsserLow += deEsserLowPassAlpha * (sample - deEsserLow);
    const sibilance = sample - deEsserLow;
    const sibilanceLevel = Math.abs(sibilance);
    const deEsserCoefficient = sibilanceLevel > deEsserEnvelope ? deEsserAttack : deEsserRelease;
    deEsserEnvelope += deEsserCoefficient * (sibilanceLevel - deEsserEnvelope);

    let deEsserGain = 1;
    if (deEsserEnvelope > deEsserThreshold) {
      const excessDb = Math.max(0, linearToDb(deEsserEnvelope) - PATHWAY_MASTERING_SETTINGS.deEsserThresholdDb);
      const reductionDb = Math.min(PATHWAY_MASTERING_SETTINGS.deEsserMaxReductionDb, excessDb * 0.65);
      deEsserGain = dbToLinear(-reductionDb);
    }
    const deEssed = deEsserLow + sibilance * deEsserGain;

    shelfLow += shelfLowPassAlpha * (deEssed - shelfLow);
    const shelfHigh = deEssed - shelfLow;
    const toned = shelfLow + shelfHigh * shelfGain;

    const level = Math.abs(toned);
    const compressorCoefficient = level > compressorEnvelope ? compressorAttack : compressorRelease;
    compressorEnvelope += compressorCoefficient * (level - compressorEnvelope);

    let compressorGain = 1;
    if (compressorEnvelope > compressorThreshold) {
      const inputDb = linearToDb(compressorEnvelope);
      const outputDb = PATHWAY_MASTERING_SETTINGS.compressorThresholdDb
        + (inputDb - PATHWAY_MASTERING_SETTINGS.compressorThresholdDb) / PATHWAY_MASTERING_SETTINGS.compressorRatio;
      compressorGain = dbToLinear(outputDb - inputDb);
    }

    processed[index] = toned * compressorGain;
  }

  const activeFloor = dbToLinear(PATHWAY_MASTERING_SETTINGS.activeFloorDb);
  let activeSquareSum = 0;
  let activeSamples = 0;
  let peak = 0;
  for (const sample of processed) {
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    if (absolute >= activeFloor) {
      activeSquareSum += sample * sample;
      activeSamples += 1;
    }
  }

  const activeRms = activeSamples ? Math.sqrt(activeSquareSum / activeSamples) : 0;
  const targetRms = dbToLinear(PATHWAY_MASTERING_SETTINGS.targetActiveRmsDb);
  const peakCeiling = dbToLinear(PATHWAY_MASTERING_SETTINGS.peakCeilingDb);
  const maxMakeupGain = dbToLinear(PATHWAY_MASTERING_SETTINGS.maxMakeupGainDb);

  let normalizationGain = activeRms > 0 ? targetRms / activeRms : 1;
  normalizationGain = Math.min(normalizationGain, maxMakeupGain);
  if (peak > 0) normalizationGain = Math.min(normalizationGain, peakCeiling / peak);

  for (let index = 0; index < processed.length; index += 1) {
    processed[index] *= normalizationGain;
  }

  return encodePcm16Mono(processed);
}

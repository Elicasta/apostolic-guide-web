export const MAX_PATHWAY_AUDIO_SCRIPT_CHARS = 20_000;
export const MAX_TTS_CHUNK_CHARS = 1_800;
export const DEFAULT_TTS_SPEED = 0.88;
export const PATHWAY_PCM_SAMPLE_RATE = 24_000;
export const PATHWAY_PCM_CHANNELS = 1;
export const PATHWAY_PCM_BITS_PER_SAMPLE = 16;

export const PATHWAY_TTS_INSTRUCTIONS = `
Speak like a thoughtful Bible teacher guiding one listener through Scripture, not like an announcer or audiobook speed-reader.
Use an unhurried, conversational cadence with natural variation in rhythm and emphasis.
Pause briefly after rhetorical questions so the listener has time to consider them.
Give Scripture quotations extra space: settle before the quotation, read the verse clearly and reverently, then leave a short beat before explaining it.
Treat paragraph changes and major transitions as real breathing points. Do not run one idea directly into the next.
Slow slightly on important doctrinal statements and let key conclusions land before continuing.
Keep the tone warm, calm, confident, pastoral, and engaged. Restrained emotion is good, but do not sound flat, mechanical, rushed, or theatrical.
Keep the same voice, pronunciation, energy, and overall pace throughout all generated segments. Never announce segment boundaries.
`.trim();

export function resolveTtsSpeed(value: string | undefined) {
  if (!value?.trim()) return DEFAULT_TTS_SPEED;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TTS_SPEED;
  return Math.min(4, Math.max(0.25, parsed));
}

function splitWords(value: string, maxChars: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const next = `${current} ${word}`;
    if (next.length <= maxChars) current = next;
    else {
      parts.push(current);
      current = word;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function splitLongParagraph(paragraph: string, maxChars: number) {
  const sentenceMatches = paragraph.match(/[^.!?]+(?:[.!?]+[\"”’']*|$)/g)?.map((item) => item.trim()).filter(Boolean) ?? [paragraph.trim()];
  const parts: string[] = [];
  let current = "";

  for (const sentence of sentenceMatches) {
    const sentenceParts = sentence.length <= maxChars ? [sentence] : splitWords(sentence, maxChars);
    for (const part of sentenceParts) {
      if (!current) {
        current = part;
        continue;
      }
      const next = `${current} ${part}`;
      if (next.length <= maxChars) current = next;
      else {
        parts.push(current);
        current = part;
      }
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function splitNarrationForTts(value: string, maxChars = MAX_TTS_CHUNK_CHARS) {
  const narration = value.replace(/\r\n/g, "\n").trim();
  if (!narration) return [];
  if (narration.length <= maxChars) return [narration];

  const paragraphs = narration.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const units = paragraphs.flatMap((paragraph) => paragraph.length <= maxChars ? [paragraph] : splitLongParagraph(paragraph, maxChars));
  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    if (!current) {
      current = unit;
      continue;
    }
    const next = `${current}\n\n${unit}`;
    if (next.length <= maxChars) current = next;
    else {
      chunks.push(current);
      current = unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function concatenatePcm16Segments(segments: Buffer[]) {
  if (!segments.length) throw new Error("No audio segments were generated.");
  for (const segment of segments) {
    if (!segment.length) throw new Error("One or more generated PCM audio segments were empty.");
    if (segment.length % 2 !== 0) throw new Error("A generated PCM audio segment did not contain complete 16-bit samples.");
  }
  return Buffer.concat(segments);
}

export function pcm16MonoToWav(
  pcm: Buffer,
  sampleRate = PATHWAY_PCM_SAMPLE_RATE,
  channels = PATHWAY_PCM_CHANNELS,
  bitsPerSample = PATHWAY_PCM_BITS_PER_SAMPLE
) {
  if (!pcm.length) throw new Error("PCM audio is empty.");
  if (bitsPerSample !== 16) throw new Error("Pathway WAV assembly currently supports 16-bit PCM only.");
  const blockAlign = channels * (bitsPerSample / 8);
  if (pcm.length % blockAlign !== 0) throw new Error("PCM audio does not align to complete samples.");

  const header = Buffer.alloc(44);
  const byteRate = sampleRate * blockAlign;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function buildLosslessWavFromPcmSegments(segments: Buffer[]) {
  return pcm16MonoToWav(concatenatePcm16Segments(segments));
}

function synchsafeSize(buffer: Buffer, offset: number) {
  return ((buffer[offset] & 0x7f) << 21) | ((buffer[offset + 1] & 0x7f) << 14) | ((buffer[offset + 2] & 0x7f) << 7) | (buffer[offset + 3] & 0x7f);
}

function stripId3Tags(buffer: Buffer) {
  let start = 0;
  if (buffer.length >= 10 && buffer.toString("ascii", 0, 3) === "ID3") {
    const flags = buffer[5];
    const size = synchsafeSize(buffer, 6);
    start = 10 + size + (flags & 0x10 ? 10 : 0);
  }

  let end = buffer.length;
  if (end - start >= 128 && buffer.toString("ascii", end - 128, end - 125) === "TAG") end -= 128;
  return buffer.subarray(Math.min(start, end), end);
}

const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_LAYER3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

function mp3FrameLength(buffer: Buffer, offset: number) {
  if (offset + 4 > buffer.length) return null;
  const header = buffer.readUInt32BE(offset);
  if (((header >>> 21) & 0x7ff) !== 0x7ff) return null;

  const versionBits = (header >>> 19) & 0x3;
  const layerBits = (header >>> 17) & 0x3;
  const bitrateIndex = (header >>> 12) & 0xf;
  const sampleRateIndex = (header >>> 10) & 0x3;
  const padding = (header >>> 9) & 0x1;
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;

  const mpeg1 = versionBits === 3;
  const bitrate = (mpeg1 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES)[bitrateIndex] * 1000;
  const sampleRates = versionBits === 3 ? [44100, 48000, 32000] : versionBits === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
  const sampleRate = sampleRates[sampleRateIndex];
  const frameLength = Math.floor((mpeg1 ? 144 : 72) * bitrate / sampleRate) + padding;
  return frameLength > 4 ? frameLength : null;
}

function findFirstFrame(buffer: Buffer) {
  const limit = Math.min(buffer.length - 4, 4096);
  for (let offset = 0; offset <= limit; offset += 1) if (mp3FrameLength(buffer, offset)) return offset;
  return -1;
}

function stripLeadingVbrHeaderFrame(buffer: Buffer) {
  let audio = buffer;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offset = findFirstFrame(audio);
    if (offset < 0) return audio;
    if (offset > 0) audio = audio.subarray(offset);
    const frameLength = mp3FrameLength(audio, 0);
    if (!frameLength || frameLength > audio.length) return audio;
    const firstFrame = audio.subarray(0, frameLength);
    const marker = firstFrame.toString("latin1");
    if (!marker.includes("Xing") && !marker.includes("Info") && !marker.includes("VBRI")) return audio;
    audio = audio.subarray(frameLength);
  }
  return audio;
}

export function normalizeMp3Segment(buffer: Buffer) {
  return stripLeadingVbrHeaderFrame(stripId3Tags(buffer));
}

export function concatenateMp3Segments(segments: Buffer[]) {
  if (!segments.length) throw new Error("No audio segments were generated.");
  const normalized = segments.map(normalizeMp3Segment).filter((segment) => segment.length > 0);
  if (normalized.length !== segments.length) throw new Error("One or more generated audio segments were empty.");
  return Buffer.concat(normalized);
}

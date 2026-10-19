import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assembleLocalBrollTimeline, type LocalVisualRecord } from "../../src/video-producer-local-broll";
import type { VideoProducerVisualBeat } from "../../src/video-producer-visuals";
import { runMediaProcess } from "../media-process";

function beat(overrides: Partial<VideoProducerVisualBeat> = {}): VideoProducerVisualBeat {
  return {
    id: "beat-paper",
    projectId: "local-proof",
    sourceStart: 2,
    duration: 2,
    dialogue: "The record was written down.",
    recommendation: "b-roll",
    intent: "Show archival paper under natural light.",
    searchQueries: ["archival paper macro"],
    vocabulary: "history",
    preferredStyle: "documentary editorial macro photography",
    avoid: [],
    status: "open",
    source: "sol",
    revision: 1,
    ...overrides
  };
}

function clip(overrides: Partial<LocalVisualRecord> = {}): LocalVisualRecord {
  return {
    id: "paper",
    filename: "archival-paper.mp4",
    description: "Archival paper fibers in natural light",
    tags: ["archival", "paper", "macro"],
    duration: 6,
    width: 640,
    height: 360,
    updatedAt: "2026-09-02T12:00:00.000Z",
    localPath: "/tmp/archival-paper.mp4",
    ...overrides
  };
}

test("local B-roll selection renders real video without a paid provider", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ag-local-broll-"));
  try {
    const source = path.join(directory, "a-roll.mp4");
    const paperPath = path.join(directory, "paper.mp4");
    const inkPath = path.join(directory, "ink.mp4");
    const streetPath = path.join(directory, "street.mp4");
    const manifestPath = path.join(directory, "manifest.json");
    const output = path.join(directory, "output.mp4");
    makeVideo(source, "blue", 440, 8);
    makeVideo(paperPath, "green", 990, 6);
    makeVideo(inkPath, "red", 1320, 6);
    makeVideo(streetPath, "yellow", 700, 6);

    const library = [
      clip({ localPath: paperPath }),
      clip({ id: "ink", filename: "ink.mp4", description: "Ink on paper fibers", tags: ["ink", "paper", "fibers"], localPath: inkPath }),
      clip({ id: "street", filename: "street.mp4", description: "City street", tags: ["crowd", "street"], localPath: streetPath })
    ];
    const assembled = assembleLocalBrollTimeline({
      projectId: "local-proof",
      sourceDuration: 8,
      library,
      beats: [
        beat(),
        beat({
          id: "beat-ink",
          sourceStart: 5.2,
          duration: 1.8,
          dialogue: "Ink still sits in the fibers.",
          intent: "Macro of ink drying in paper.",
          searchQueries: ["ink on paper fibers"]
        })
      ]
    });
    assert.equal(assembled.unresolvedBeatIds.length, 0);
    assert.equal(assembled.placements.length, 2);

    const assets = new Map(library.map((asset) => [asset.id, asset]));
    writeFileSync(manifestPath, JSON.stringify(manifestFor(source, assembled.placements, assets)));
    runMediaProcess("python3", ["scripts/render_video_producer_local_fixture.py", manifestPath, output], { cwd: process.cwd() });

    const paper = assembled.placements.find((placement) => placement.assetId === "paper");
    const ink = assembled.placements.find((placement) => placement.assetId === "ink");
    assert.ok(paper && ink);
    assert.equal(classify(frameRgb(output, 0.4)), "blue");
    assert.equal(classify(frameRgb(output, midpoint(paper))), "green");
    assert.equal(classify(frameRgb(output, midpoint(ink))), "red");
    assert.equal(classify(frameRgb(output, 7.4)), "blue");
    assert.equal(classify(frameRgb(output, 2.6)) === "yellow", false);

    const frequency = dominantFrequency(output);
    assert.ok(Math.abs(frequency - 440) < 8, `A-roll audio changed: ${frequency}`);
    const duration = probeDuration(output);
    assert.ok(Math.abs(duration - 8) < 0.35, `output duration changed: ${duration}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function midpoint(placement: { outputRanges: Array<{ outputStart: number; outputEnd: number }> }) {
  const range = placement.outputRanges[0];
  assert.ok(range);
  return (range.outputStart + range.outputEnd) / 2;
}

function manifestFor(
  source: string,
  placements: ReturnType<typeof assembleLocalBrollTimeline>["placements"],
  assets: Map<string, LocalVisualRecord>
) {
  return {
    version: 3,
    project: { id: "local-proof", title: "Local B-roll Proof", mode: "podcast", pathway: null },
    source: { filename: "a-roll.mp4", duration: 8, range: null, localPath: source },
    renderPlan: {
      version: 2,
      mode: "podcast",
      sourceDuration: 8,
      outputDuration: 8,
      keepSegments: [{ start: 0, end: 8 }],
      overlays: [],
      motion: [],
      music: [],
      captions: { enabled: false, style: "minimal", animation: "none", maxWordsPerCard: 8, position: "lower", highlightCurrentWord: false },
      audioPreset: "none",
      colorPreset: "none",
      intro: false,
      outro: false,
      output: { format: "mp4", width: 1920, height: 1080, fps: 30 }
    },
    transcript: { text: "", duration: 8, words: [], segments: [] },
    musicTracks: [],
    visuals: {
      version: 1,
      authority: "assembly",
      audioPolicy: "a-roll-continues",
      placements: placements.map((placement) => {
        const asset = assets.get(placement.assetId);
        assert.ok(asset?.localPath);
        return {
          placement,
          asset: {
            id: asset.id,
            provider: "ag-library",
            providerAssetId: asset.id,
            filename: asset.filename,
            localPath: asset.localPath,
            duration: asset.duration,
            width: asset.width,
            height: asset.height,
            fps: 30,
            revision: 1,
            sha256: "local"
          }
        };
      }),
      licenseManifest: []
    },
    brand: {}
  };
}

function makeVideo(file: string, color: string, frequency: number, duration: number) {
  runMediaProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=${color}:s=640x360:r=30:d=${duration}`,
    "-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`,
    "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", file
  ]);
}

function frameRgb(file: string, second: number) {
  const result = runMediaProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-ss", String(second), "-i", file,
    "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
  ], { encoding: "buffer" });
  const raw = result.stdout;
  assert.ok(Buffer.isBuffer(raw) && raw.length >= 3);
  return [raw[0] ?? 0, raw[1] ?? 0, raw[2] ?? 0] as const;
}

function classify(rgb: readonly [number, number, number]) {
  const [red, green, blue] = rgb;
  if (blue > red + 40 && blue > green + 20) return "blue";
  if (green > red + 35 && green > blue + 20) return "green";
  if (red > green + 35 && red > blue + 20) return "red";
  if (red > 180 && green > 180 && blue < 80) return "yellow";
  return `other:${red},${green},${blue}`;
}

function probeDuration(file: string) {
  const result = runMediaProcess("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file
  ]);
  return Number(String(result.stdout).trim());
}

function dominantFrequency(file: string) {
  const result = runMediaProcess("python3", ["-c", `
import subprocess, sys
import numpy as np
raw = subprocess.check_output(["ffmpeg","-hide_banner","-loglevel","error","-ss","1","-t","4","-i",sys.argv[1],"-vn","-ac","1","-ar","8000","-f","f32le","pipe:1"])
samples = np.frombuffer(raw, dtype=np.float32)
windowed = samples * np.hanning(len(samples))
spectrum = np.abs(np.fft.rfft(windowed))
frequencies = np.fft.rfftfreq(len(samples), d=1/8000)
print(float(frequencies[int(np.argmax(spectrum))]))
`, file]);
  return Number(String(result.stdout).trim());
}

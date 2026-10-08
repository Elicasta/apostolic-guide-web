import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDefaultVideoProducerPlan, compileVideoProducerRenderPlan } from "../../src/video-producer";
import { trimProducerScene } from "../../src/video-producer-editor";
import { producerDownloadDecision } from "../../src/video-producer-editor-persistence";
import { runMediaProcess } from "../media-process";

test("a trimmed scene renders to a shorter local master that can be downloaded", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ag-editor-render-"));
  try {
    const source = path.join(directory, "source.mp4");
    const output = path.join(directory, "master.mp4");
    runMediaProcess("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=4",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=4",
      "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", source
    ]);

    const plan = buildDefaultVideoProducerPlan("podcast", 4);
    const trimmed = trimProducerScene(plan, { id: "scene-0", start: 0, end: 4, text: "Recording" }, 1, 3);
    const compiled = compileVideoProducerRenderPlan(trimmed);
    assert.ok(Math.abs(compiled.outputDuration - 2) < 0.05);
    renderKeepSegments(source, compiled.keepSegments, output);
    const duration = probeDuration(output);
    assert.ok(Math.abs(duration - compiled.outputDuration) < 0.35, `rendered ${duration}, expected ${compiled.outputDuration}`);
    const decision = producerDownloadDecision({ projectFound: true, status: "review", outputPath: output });
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.outputPath, output);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function renderKeepSegments(source: string, segments: Array<{ start: number; end: number }>, output: string) {
  const directory = path.dirname(output);
  const list = path.join(directory, "concat.txt");
  const parts = segments.map((segment, index) => {
    const file = path.join(directory, `part-${index}.mp4`);
    runMediaProcess("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(segment.start), "-to", String(segment.end), "-i", source,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", file
    ]);
    return file;
  });
  writeFileSync(list, parts.map((file) => `file '${file}'`).join("\n"));
  runMediaProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", output
  ]);
}

function probeDuration(file: string) {
  const result = runMediaProcess("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file
  ]);
  return Number(String(result.stdout).trim());
}

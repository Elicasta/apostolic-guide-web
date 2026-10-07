import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync("src/video-producer-server.ts", "utf8");
const workflow = readFileSync(".github/workflows/video-producer-preview-render.yml", "utf8");
const chunkWorker = readFileSync("scripts/render_video_producer_preview_chunk_worker.py", "utf8");
const assemblyWorker = readFileSync("scripts/assemble_video_producer_preview_worker.py", "utf8");

test("staging renders are divided into bounded proof chunks instead of one long FFmpeg job", () => {
  assert.match(server, /const targetSeconds = 12/);
  assert.match(server, /Math\.min\(240, Math\.ceil\(duration \/ targetSeconds\)\)/);
  assert.match(server, /input\.eventType === "video-producer-render" && input\.payload\.worker_ref === "codex\/video-producer"/);
  assert.match(server, /"video-producer-render-preview"/);
  assert.match(server, /preview_matrix: JSON\.stringify\(chunks\)/);
});

test("preview workflow renders matrix chunks before one assembly authority completes the proof", () => {
  assert.match(workflow, /types: \[video-producer-render-preview\]/);
  assert.match(workflow, /fail-fast: false/);
  assert.match(workflow, /max-parallel: 20/);
  assert.match(workflow, /fromJSON\(github\.event\.client_payload\.preview_matrix\)/);
  assert.match(workflow, /needs: render_chunks/);
  assert.match(workflow, /assemble_video_producer_preview_worker\.py/);
  assert.match(workflow, /needs: \[render_chunks, assemble\]/);
});

test("preview chunks preserve camera and recorder timing while seeking the source media", () => {
  assert.match(chunkWorker, /source_start = float\(raw\.get\("start"\) or 0\)/);
  assert.match(chunkWorker, /"start": source_start - source_shift/);
  assert.match(chunkWorker, /chunk_global_start = original_global_base \+ source_shift/);
  assert.match(chunkWorker, /asset_seek = max\(0\.0, chunk_global_start - original_offset\)/);
  assert.match(chunkWorker, /media\["inputSeekSeconds"\] = asset_seek/);
  assert.match(chunkWorker, /media\["offsetSeconds"\] = original_offset \+ asset_seek - chunk_global_start/);
  assert.match(chunkWorker, /inject_seek\(command, payload\["source_url"\], source_seek/);
});

test("chunk jobs never claim terminal completion", () => {
  assert.doesNotMatch(chunkWorker, /callback\(payload,\s*"completed"/);
  assert.doesNotMatch(chunkWorker, /callback\(payload,\s*"failed"/);
  assert.match(chunkWorker, /"status": "rendering"/);
});

test("assembly validates every ordered chunk, uploads, then marks the render completed", () => {
  assert.match(assemblyWorker, /if len\(chunks\) != expected/);
  assert.match(assemblyWorker, /indices != list\(range\(expected\)\)/);
  const upload = assemblyWorker.indexOf('upload(payload["output_upload_url"], sys.argv[3])');
  const completed = assemblyWorker.indexOf('callback(payload, "completed", 100, "Ready to review")');
  assert.ok(upload >= 0);
  assert.ok(completed > upload);
});

test("preview chunks render without bumpers and final assembly adds them once", () => {
  assert.match(chunkWorker, /plan\["intro"\] = False/);
  assert.match(chunkWorker, /plan\["outro"\] = False/);
  assert.match(assemblyWorker, /package_with_bumpers\(manifest, main_file, sys\.argv\[3\], directory\)/);
});

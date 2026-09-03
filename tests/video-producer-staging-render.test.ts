import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync("scripts/render_video_producer_visual_pass_worker.py", "utf8");

test("staging Video Producer renders use a runner-safe inspection profile only", () => {
  assert.match(worker, /payload\.get\("worker_ref"\) == "codex\/video-producer"/);
  assert.match(worker, /if not STAGED_INSPECTION_ENCODE:\n\s+return/);
  assert.match(worker, /output\["width"\], output\["height"\] = 640, 360/);
  assert.match(worker, /output\["width"\], output\["height"\] = 360, 640/);
  assert.match(worker, /command\[preset_index\] = "ultrafast"/);
  assert.match(worker, /command\[crf_index\] = "23"/);
});

test("staging downscale happens after master-coordinate graphics are authored", () => {
  const buildGraphics = worker.indexOf("kinetic_count = build_graphics_ass(manifest, ass_path)");
  const applyProfile = worker.indexOf("apply_staged_inspection_profile(manifest)", buildGraphics + 1);
  const render = worker.indexOf("run_main_render_with_progress(payload, manifest, source_path, ass_path, main_path)", applyProfile + 1);
  assert.ok(buildGraphics >= 0);
  assert.ok(applyProfile > buildGraphics);
  assert.ok(render > applyProfile);
});

test("Visual Pass B-roll scaling follows the active output dimensions", () => {
  assert.match(worker, /output_width = int\(output\.get\("width"\) or 1920\)/);
  assert.match(worker, /output_height = int\(output\.get\("height"\) or 1080\)/);
  assert.match(worker, /visual_scale_chain\(output_width, output_height, fit, scale\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { explainMediaProcess } from "./media-process";
import { isDefaultUnitTest, mediaTestFiles, mediaToolFailure } from "../scripts/run-media-tests";

test("media process failures distinguish a missing executable, a signal, and an FFmpeg exit", () => {
  assert.match(
    explainMediaProcess("ffmpeg", { error: Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" }), status: null, signal: null }) ?? "",
    /Missing media executable: ffmpeg/
  );
  assert.match(
    explainMediaProcess("ffmpeg", { error: null, status: null, signal: "SIGKILL", stderr: "" }) ?? "",
    /killed by signal SIGKILL/
  );
  assert.match(
    explainMediaProcess("ffmpeg", { error: null, status: null, signal: null, stderr: "" }) ?? "",
    /without an exit code or signal/
  );
  assert.match(
    explainMediaProcess("ffmpeg", { error: null, status: 1, signal: null, stderr: "Encoder not found" }) ?? "",
    /exited 1.*Encoder not found/
  );
  assert.equal(explainMediaProcess("ffmpeg", { error: null, status: 0, signal: null }), null);
});

test("a missing media executable is a hard failure, not a skipped test", () => {
  const failure = mediaToolFailure("ffmpeg-not-installed-ag");
  assert.match(failure ?? "", /Missing media executable: ffmpeg-not-installed-ag/);
});

test("FFmpeg integration tests stay out of the default unit suite and the Vercel build", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  const workflow = readFileSync(".github/workflows/video-producer-worker-check.yml", "utf8");
  const studio = readFileSync(".github/workflows/ag-studio-checks.yml", "utf8");
  assert.equal(pkg.scripts.test, "node --import tsx --test tests/*.test.ts");
  assert.equal(pkg.scripts["test:media"], "node --import tsx scripts/run-media-tests.ts");
  assert.equal(pkg.scripts.build, "npm test && next build");
  assert.equal(pkg.scripts.build.includes("test:media"), false);
  assert.equal(isDefaultUnitTest("tests/video-producer-local-broll.test.ts"), true);
  assert.equal(isDefaultUnitTest("tests/media/video-producer-local-broll.test.ts"), false);
  assert.ok(mediaTestFiles().includes("tests/media/video-producer-local-broll.test.ts"));
  const mediaStep = workflow.indexOf("npm run test:media");
  const installStep = workflow.indexOf("apt-get install -y --no-install-recommends ffmpeg");
  assert.ok(installStep >= 0);
  assert.ok(mediaStep > installStep);
  assert.doesNotMatch(workflow.slice(mediaStep, mediaStep + 400), /continue-on-error:\s*true/);
  assert.match(workflow, /node-version: 22/);
  assert.doesNotMatch(studio, /npm run test:media/);
  assert.match(readFileSync("scripts/run-media-tests.ts", "utf8"), /do not skip/i);
  assert.match(readFileSync("scripts/run-media-tests.ts", "utf8"), /Node 22/);
});

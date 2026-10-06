import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDefaultVideoProducerPlan, compileVideoProducerRenderPlan } from "../src/video-producer";
import { replaceSceneCuts, trimProducerScene } from "../src/video-producer-editor";
import {
  claimApprovedRender,
  producerDownloadDecision,
  RENDER_CLAIM_STATUS,
  saveProducerEditorDocument,
  type EditorMetadata,
  type EditorPersistence,
  type EditorProjectRecord,
  type RenderClaimStore
} from "../src/video-producer-editor-persistence";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

test("concurrent editor saves against isolated sqlite keep one revision", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ag-editor-db-"));
  const file = path.join(directory, "editor.sqlite");
  try {
    const setup = new DatabaseSync(file);
    setup.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE video_producer_projects (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        edit_plan TEXT,
        updated_at TEXT NOT NULL,
        director_metadata TEXT,
        approval_fingerprint TEXT,
        approved_at TEXT,
        selected_music_track_id TEXT,
        updated_by TEXT,
        deleted_at TEXT
      );
    `);
    const original = buildDefaultVideoProducerPlan("podcast", 30);
    setup.prepare(`
      INSERT INTO video_producer_projects
        (id, mode, status, edit_plan, updated_at, director_metadata, approval_fingerprint)
      VALUES (?, 'podcast', 'approved', ?, '2026-10-06T12:00:00.000Z', '{}', 'approved-fingerprint')
    `).run(PROJECT_ID, JSON.stringify(original));
    setup.close();

    const first = sqliteEditorStore(file);
    const second = sqliteEditorStore(file);
    const scene = { id: "middle", start: 10, end: 20, text: "Middle." };
    const leftPlan = trimProducerScene(original, scene, 12, 18);
    const rightPlan = replaceSceneCuts(original, scene, [{ id: "remove", start: 10, end: 20, reason: "Removed" }]);
    const [left, right] = await Promise.all([
      saveProducerEditorDocument(first.store, {
        projectId: PROJECT_ID,
        expectedUpdatedAt: "2026-10-06T12:00:00.000Z",
        plan: leftPlan,
        lockedScenes: ["middle"],
        userId: "editor-a",
        now: "2026-10-06T12:00:01.000Z"
      }),
      saveProducerEditorDocument(second.store, {
        projectId: PROJECT_ID,
        expectedUpdatedAt: "2026-10-06T12:00:00.000Z",
        plan: rightPlan,
        lockedScenes: [],
        userId: "editor-b",
        now: "2026-10-06T12:00:02.000Z"
      })
    ]);
    const results = [left, right];
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(results.filter((result) => !result.ok && result.status === 409).length, 1);

    const saved = first.store.loadProject(PROJECT_ID);
    const row = await saved;
    assert.ok(row);
    assert.equal(row.status, "planned");
    assert.equal(row.director_metadata?.sceneEditor?.lockedScenes?.length === 1 || row.director_metadata?.sceneEditor?.lockedScenes?.length === 0, true);
    const winnerLocked = row.director_metadata?.sceneEditor?.lockedScenes ?? [];
    const winnerIsLeft = JSON.stringify(row.edit_plan) === JSON.stringify(leftPlan);
    const winnerIsRight = JSON.stringify(row.edit_plan) === JSON.stringify(rightPlan);
    assert.equal(winnerIsLeft || winnerIsRight, true);
    assert.equal(winnerLocked.includes("middle"), winnerIsLeft);
    assert.notEqual(row.updated_at, "2026-10-06T12:00:00.000Z");

    const stale = await saveProducerEditorDocument(first.store, {
      projectId: PROJECT_ID,
      expectedUpdatedAt: "2026-10-06T12:00:00.000Z",
      plan: original,
      lockedScenes: ["scene-other"],
      userId: "editor-c",
      now: "2026-10-06T12:00:03.000Z"
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.status, 409);
    const afterStale = await first.store.loadProject(PROJECT_ID);
    assert.equal(JSON.stringify(afterStale?.edit_plan), JSON.stringify(row.edit_plan));
    assert.deepEqual(afterStale?.director_metadata?.sceneEditor?.lockedScenes, winnerLocked);
    first.close();
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("only one approved render claim succeeds in the isolated database", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ag-render-db-"));
  const file = path.join(directory, "render.sqlite");
  try {
    const setup = new DatabaseSync(file);
    setup.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE video_producer_projects (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        approval_fingerprint TEXT,
        updated_by TEXT,
        deleted_at TEXT
      );
    `);
    setup.prepare(`
      INSERT INTO video_producer_projects (id, status, updated_at, approval_fingerprint)
      VALUES (?, ?, '2026-10-06T12:00:00.000Z', 'fingerprint-1')
    `).run(PROJECT_ID, RENDER_CLAIM_STATUS);
    setup.close();

    const [first, second] = await Promise.all([
      claimApprovedRender(sqliteRenderStore(file), {
        projectId: PROJECT_ID,
        expectedUpdatedAt: "2026-10-06T12:00:00.000Z",
        fingerprint: "fingerprint-1",
        userId: "renderer-a"
      }),
      claimApprovedRender(sqliteRenderStore(file), {
        projectId: PROJECT_ID,
        expectedUpdatedAt: "2026-10-06T12:00:00.000Z",
        fingerprint: "fingerprint-1",
        userId: "renderer-b"
      })
    ]);
    const claims = [first, second];
    assert.equal(claims.filter((claim) => claim.ok).length, 1);
    assert.equal(claims.filter((claim) => !claim.ok).length, 1);
    const db = new DatabaseSync(file);
    const row = db.prepare("SELECT status, updated_by FROM video_producer_projects WHERE id = ?").get(PROJECT_ID) as { status: string; updated_by: string };
    assert.equal(row.status, "rendering");
    assert.ok(row.updated_by === "renderer-a" || row.updated_by === "renderer-b");
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("download decision follows the latest completed master in the isolated database", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ag-download-db-"));
  const file = path.join(directory, "download.sqlite");
  try {
    const db = new DatabaseSync(file);
    db.exec(`
      CREATE TABLE video_producer_projects (id TEXT PRIMARY KEY, status TEXT NOT NULL);
      CREATE TABLE video_producer_renders (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        output_storage_path TEXT,
        completed_at TEXT
      );
    `);
    db.prepare("INSERT INTO video_producer_projects (id, status) VALUES (?, 'review')").run(PROJECT_ID);
    db.prepare("INSERT INTO video_producer_renders (id, project_id, status, output_storage_path, completed_at) VALUES ('old', ?, 'completed', 'old.mp4', '2026-10-01T00:00:00.000Z')").run(PROJECT_ID);
    db.prepare("INSERT INTO video_producer_renders (id, project_id, status, output_storage_path, completed_at) VALUES ('new', ?, 'completed', 'new.mp4', '2026-10-06T00:00:00.000Z')").run(PROJECT_ID);
    const latest = db.prepare(`
      SELECT output_storage_path
      FROM video_producer_renders
      WHERE project_id = ? AND status = 'completed' AND output_storage_path IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 1
    `).get(PROJECT_ID) as { output_storage_path: string };
    const project = db.prepare("SELECT status FROM video_producer_projects WHERE id = ?").get(PROJECT_ID) as { status: string };
    const ready = producerDownloadDecision({
      projectFound: true,
      status: project.status,
      outputPath: latest.output_storage_path
    });
    assert.equal(ready.ok, true);
    if (ready.ok) assert.equal(ready.outputPath, "new.mp4");
    assert.equal(producerDownloadDecision({ projectFound: true, status: "planned", outputPath: "new.mp4" }).ok, false);
    assert.equal(producerDownloadDecision({ projectFound: true, status: "completed", outputPath: null }).status, 404);
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a trimmed scene renders to a shorter local master that can be downloaded", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ag-editor-render-"));
  try {
    const source = path.join(directory, "source.mp4");
    const output = path.join(directory, "master.mp4");
    const made = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=4",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=4",
      "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", source
    ], { encoding: "utf8" });
    assert.equal(made.status, 0, made.stderr);

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

function sqliteEditorStore(file: string) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 3000");
  const store: EditorPersistence = {
    async loadProject(projectId) {
      const row = db.prepare(`
        SELECT id, mode, status, edit_plan, updated_at, director_metadata
        FROM video_producer_projects
        WHERE id = ? AND deleted_at IS NULL
      `).get(projectId) as {
        id: string;
        mode: "podcast" | "reels";
        status: string;
        edit_plan: string | null;
        updated_at: string;
        director_metadata: string | null;
      } | undefined;
      if (!row) return null;
      return {
        id: row.id,
        mode: row.mode,
        status: row.status,
        edit_plan: row.edit_plan ? JSON.parse(row.edit_plan) : null,
        updated_at: row.updated_at,
        director_metadata: row.director_metadata ? JSON.parse(row.director_metadata) as EditorMetadata : null
      } satisfies EditorProjectRecord;
    },
    async saveIfUnchanged(input) {
      const result = db.prepare(`
        UPDATE video_producer_projects
        SET edit_plan = ?,
            selected_music_track_id = ?,
            status = 'planned',
            approval_fingerprint = NULL,
            approved_at = NULL,
            director_metadata = ?,
            updated_by = ?,
            updated_at = ?
        WHERE id = ? AND updated_at = ? AND deleted_at IS NULL
      `).run(
        JSON.stringify(input.patch.edit_plan),
        input.patch.selected_music_track_id,
        JSON.stringify(input.patch.director_metadata),
        input.patch.updated_by,
        input.patch.updated_at,
        input.projectId,
        input.expectedUpdatedAt
      );
      if (result.changes !== 1) return null;
      const row = db.prepare("SELECT updated_at FROM video_producer_projects WHERE id = ?").get(input.projectId) as { updated_at: string };
      return { updatedAt: row.updated_at };
    }
  };
  return { store, close: () => db.close() };
}

function sqliteRenderStore(file: string): RenderClaimStore {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 3000");
  return {
    async claimApproved(input) {
      try {
        const result = db.prepare(`
          UPDATE video_producer_projects
          SET status = 'rendering', updated_by = ?
          WHERE id = ? AND status = ? AND updated_at = ? AND approval_fingerprint = ? AND deleted_at IS NULL
        `).run(input.userId, input.projectId, RENDER_CLAIM_STATUS, input.expectedUpdatedAt, input.fingerprint);
        if (result.changes !== 1) return null;
        const row = db.prepare("SELECT updated_at FROM video_producer_projects WHERE id = ?").get(input.projectId) as { updated_at: string };
        return { updatedAt: row.updated_at };
      } finally {
        db.close();
      }
    }
  };
}

function renderKeepSegments(source: string, segments: Array<{ start: number; end: number }>, output: string) {
  const directory = path.dirname(output);
  const list = path.join(directory, "concat.txt");
  const parts = segments.map((segment, index) => {
    const file = path.join(directory, `part-${index}.mp4`);
    const result = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(segment.start), "-to", String(segment.end), "-i", source,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", file
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return file;
  });
  writeFileSync(list, parts.map((file) => `file '${file}'`).join("\n"));
  const joined = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", output
  ], { encoding: "utf8" });
  assert.equal(joined.status, 0, joined.stderr);
}

function probeDuration(file: string) {
  const result = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return Number(result.stdout.trim());
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  DOCTRINE_EPISODES,
  TELEPROMPTER_DOCTRINE_SEED_KEY,
  TELEPROMPTER_DOCTRINE_SEED_VERSION,
  doctrineDocumentId,
  doctrineDocumentTitle,
  getDoctrineSeedDocuments,
} from "../src/lib/teleprompter/doctrine";
import { buildLegacyDoctrineScript } from "../src/lib/teleprompter/doctrine/script";
import {
  TELEPROMPTER_DOCTRINE_BACKUP_KEY,
  loadTeleprompterDocuments,
  upgradeDoctrineSeeds,
} from "../src/lib/teleprompter/seeded-storage";
import { TELEPROMPTER_STORAGE_KEY } from "../src/lib/teleprompter/storage";
import type { TeleprompterDocument } from "../src/lib/teleprompter/types";

function legacyDocument(index: number): TeleprompterDocument {
  const episode = DOCTRINE_EPISODES[index];
  return {
    id: doctrineDocumentId(episode.number),
    title: doctrineDocumentTitle(episode),
    content: buildLegacyDoctrineScript(episode),
    createdAt: "2026-11-15T05:00:00.000Z",
    updatedAt: "2026-11-15T05:00:00.000Z",
  };
}

test("exact legacy doctrine script upgrades, preserving stable ID and creation time", () => {
  const old = legacyDocument(0);
  const next = upgradeDoctrineSeeds([old]);
  assert.equal(next.length, 1);
  assert.equal(next[0].id, old.id);
  assert.equal(next[0].createdAt, old.createdAt);
  assert.notEqual(next[0].content, old.content);
  assert.equal(next[0].content, getDoctrineSeedDocuments()[0].content);
  assert.equal(next[0].updatedAt, getDoctrineSeedDocuments()[0].updatedAt);
  assert.deepEqual(upgradeDoctrineSeeds(next), next);
});

test("edited, renamed, unrelated and deleted doctrine scripts are never overwritten or re-added", () => {
  const original = legacyDocument(0);
  const edited = { ...original, content: "# My own teaching\nThis is my explanation." };
  const renamed = { ...legacyDocument(1), title: "My renamed episode" };
  const unrelated: TeleprompterDocument = {
    id: "my-personal-lesson",
    title: "My own notes",
    content: "# Do not touch",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  const result = upgradeDoctrineSeeds([edited, renamed, unrelated]);
  assert.deepEqual(result, [edited, renamed, unrelated]);
  assert.equal(result.some((doc) => doc.id === doctrineDocumentId(3)), false);
});

test("browser upgrade snapshots previous library, refreshes exact seeds, and keeps custom scripts", () => {
  const old = legacyDocument(0);
  const edited = { ...legacyDocument(1), content: "# Edited by Eli\nKeep this paragraph." };
  const scripts = [old, edited];
  const map = new Map<string, string>([
    [TELEPROMPTER_STORAGE_KEY, JSON.stringify(scripts)],
    [TELEPROMPTER_DOCTRINE_SEED_KEY, "1"],
  ]);
  const localStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
  Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });
  try {
    const loaded = loadTeleprompterDocuments();
    assert.equal(loaded.find((doc) => doc.id === old.id)?.content, getDoctrineSeedDocuments()[0].content);
    assert.deepEqual(loaded.find((doc) => doc.id === edited.id), edited);
    assert.equal(map.get(TELEPROMPTER_DOCTRINE_SEED_KEY), String(TELEPROMPTER_DOCTRINE_SEED_VERSION));
    const backup = map.get(TELEPROMPTER_DOCTRINE_BACKUP_KEY);
    assert.ok(backup);
    const snapshot = JSON.parse(backup) as TeleprompterDocument[];
    for (const doc of scripts) {
      assert.deepEqual(snapshot.find((item) => item.id === doc.id), doc);
    }
    assert.ok(loaded.some((doc) => doc.id === "apostolic-guide-teaching-who-did-jesus-pray-to"));
    assert.deepEqual(loadTeleprompterDocuments(), loaded);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test("when backup fails, original doctrine scripts are not replaced or marked upgraded", () => {
  const old = legacyDocument(0);
  const map = new Map<string, string>([
    [TELEPROMPTER_STORAGE_KEY, JSON.stringify([old])],
    [TELEPROMPTER_DOCTRINE_SEED_KEY, "1"],
  ]);
  const localStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === TELEPROMPTER_DOCTRINE_BACKUP_KEY) throw new Error("Quota exceeded");
      map.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });
  try {
    const loaded = loadTeleprompterDocuments();
    assert.deepEqual(loaded.find((doc) => doc.id === old.id), old);
    assert.equal(map.get(TELEPROMPTER_DOCTRINE_SEED_KEY), "1");
    assert.equal(map.get(TELEPROMPTER_DOCTRINE_BACKUP_KEY), undefined);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

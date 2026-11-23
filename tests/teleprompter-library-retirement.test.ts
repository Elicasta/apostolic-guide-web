import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getDoctrineSeedDocuments } from "../src/lib/teleprompter/doctrine";
import {
  TELEPROMPTER_DOCTRINE_SEED_KEY,
  TELEPROMPTER_DOCTRINE_SEED_VERSION,
} from "../src/lib/teleprompter/doctrine";
import { getEpisodeSeedDocuments, TELEPROMPTER_EPISODE_SEED_KEY, TELEPROMPTER_EPISODE_SEED_VERSION } from "../src/lib/teleprompter/episodes";
import { getPersonalChannelSeedDocuments, TELEPROMPTER_PERSONAL_SEED_KEY, TELEPROMPTER_PERSONAL_SEED_VERSION } from "../src/lib/teleprompter/personal";
import {
  TELEPROMPTER_LEGACY_ARCHIVE_KEY,
  loadTeleprompterDocuments,
} from "../src/lib/teleprompter/seeded-storage";
import {
  TELEPROMPTER_LEGACY_EPISODES_RETIRED_KEY,
  TELEPROMPTER_STORAGE_KEY,
  getSeedDocuments as getOldStarterDocuments,
  selectTeleprompterDocument,
} from "../src/lib/teleprompter/storage";
import type { TeleprompterDocument } from "../src/lib/teleprompter/types";

function makeStore(initial: Record<string, string> = {}, failingKey?: string) {
  const values = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === failingKey) throw new Error("Storage quota exceeded");
      values.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });
  return values;
}

function closeStore() {
  delete (globalThis as { window?: unknown }).window;
}

test("retiring old Episodes 01-12 archives edited originals and keeps 2026 Doctrine and personal drafts", () => {
  const oldOne: TeleprompterDocument = {
    ...getOldStarterDocuments()[0],
    content: "# My personally revised older Episode 1",
    updatedAt: "2026-11-21T11:00:00.000Z",
  };
  const oldTwo: TeleprompterDocument = {
    ...getEpisodeSeedDocuments()[0],
    title: "My renamed old Episode 2",
    content: "# Do not lose this old script",
  };
  const newDoctrine = getDoctrineSeedDocuments()[0];
  const personal = getPersonalChannelSeedDocuments()[0];
  const custom: TeleprompterDocument = {
    id: "my-custom-script",
    title: "Sunday lesson",
    content: "# Keep me",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  };
  const original = [oldOne, oldTwo, newDoctrine, personal, custom];
  const storage = makeStore({
    [TELEPROMPTER_STORAGE_KEY]: JSON.stringify(original),
    [TELEPROMPTER_EPISODE_SEED_KEY]: String(TELEPROMPTER_EPISODE_SEED_VERSION),
    [TELEPROMPTER_PERSONAL_SEED_KEY]: String(TELEPROMPTER_PERSONAL_SEED_VERSION),
    [TELEPROMPTER_DOCTRINE_SEED_KEY]: String(TELEPROMPTER_DOCTRINE_SEED_VERSION),
  });

  try {
    const loaded = loadTeleprompterDocuments();
    assert.equal(loaded.some((document) => /^apostolic-guide-episode-/.test(document.id)), false);
    assert.deepEqual(loaded.find((document) => document.id === newDoctrine.id), newDoctrine);
    assert.deepEqual(loaded.find((document) => document.id === personal.id), personal);
    assert.deepEqual(loaded.find((document) => document.id === custom.id), custom);
    const archived = JSON.parse(storage.get(TELEPROMPTER_LEGACY_ARCHIVE_KEY) ?? "[]") as TeleprompterDocument[];
    assert.deepEqual(archived, [oldOne, oldTwo]);
    assert.equal(storage.get(TELEPROMPTER_LEGACY_EPISODES_RETIRED_KEY), "1");

    // Reload does not silently reintroduce the old starter or duplicate archives.
    assert.deepEqual(loadTeleprompterDocuments(), loaded);
    assert.deepEqual(JSON.parse(storage.get(TELEPROMPTER_LEGACY_ARCHIVE_KEY) ?? "[]"), archived);
    assert.equal(selectTeleprompterDocument(loaded, oldOne.id)?.id, newDoctrine.id);
  } finally {
    closeStore();
  }
});

test("new browser installs only current scripts in the live library", () => {
  const storage = makeStore();
  try {
    const loaded = loadTeleprompterDocuments();
    assert.equal(loaded.filter((document) => document.id.startsWith("ag-doctrine-ep-")).length, 24);
    assert.equal(loaded.filter((document) => /^apostolic-guide-episode-/.test(document.id)).length, 0);
    assert.equal(loaded.some((document) => document.id.startsWith("eli-castaneda-episode-")), true);
    assert.equal(storage.get(TELEPROMPTER_LEGACY_EPISODES_RETIRED_KEY), "1");
    const archived = JSON.parse(storage.get(TELEPROMPTER_LEGACY_ARCHIVE_KEY) ?? "[]");
    assert.equal(archived.length, 12);
    assert.deepEqual(loadTeleprompterDocuments(), loaded);
  } finally {
    closeStore();
  }
});

test("backup failure leaves older episodes untouched and does not mark them retired", () => {
  const oldOne = getOldStarterDocuments()[0];
  const storage = makeStore({ [TELEPROMPTER_STORAGE_KEY]: JSON.stringify([oldOne]) }, TELEPROMPTER_LEGACY_ARCHIVE_KEY);
  try {
    const loaded = loadTeleprompterDocuments();
    assert.deepEqual(loaded.find((document) => document.id === oldOne.id), oldOne);
    assert.equal(storage.has(TELEPROMPTER_LEGACY_EPISODES_RETIRED_KEY), false);
    assert.equal(storage.has(TELEPROMPTER_LEGACY_ARCHIVE_KEY), false);
  } finally {
    closeStore();
  }
});

test("library CSS allows independent sidebar scrolling at desktop, tablet and phone widths", () => {
  const css = readFileSync("app/teleprompter/teleprompter.css", "utf8");
  assert.match(css, /\.tp-library-list \{[^}]*min-height: 132px;[^}]*overflow-y: auto;[^}]*touch-action: pan-y/s);
  assert.match(css, /\.tp-library-sidebar \{[^}]*min-height: 0;[^}]*overflow: hidden/s);
  assert.match(css, /\.tp-library-grid \{ display: block; height: 100%; overflow-y: auto/s);
  assert.match(css, /\.tp-library-sidebar \{ height: min\(67dvh, 580px\); min-height: 340px; max-height: none/s);
});

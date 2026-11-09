import assert from "node:assert/strict";
import test from "node:test";
import { parseTeleprompterDocument } from "../src/lib/teleprompter/parser";
import {
  TELEPROMPTER_LAST_DOCUMENT_KEY,
  TELEPROMPTER_PREVIOUS_SCRIPTS_KEY,
  TELEPROMPTER_STORAGE_KEY,
  TELEPROMPTER_TEACHING_RESET_KEY,
  getSeedDocuments,
  migrateToTeachingGuide,
} from "../src/lib/teleprompter/storage";
import { getSeedDocuments as getBootstrapSeeds } from "../src/lib/teleprompter/seeded-storage";
import {
  TEACHING_SESSION_ID,
  TEACHING_SESSION_SCRIPT,
  TEACHING_SESSION_TITLE,
  TEACHING_SESSION_VERSION,
} from "../src/lib/teleprompter/teaching-session";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

test("only the new section guide is offered as a default", () => {
  assert.deepEqual(getSeedDocuments().map((doc) => doc.id), [TEACHING_SESSION_ID]);
  assert.deepEqual(getBootstrapSeeds().map((doc) => doc.id), [TEACHING_SESSION_ID]);
  assert.equal(getSeedDocuments()[0].title, TEACHING_SESSION_TITLE);
});

test("the teaching guide has nine independent reading sections with verses, points and delivery notes", () => {
  const sections = parseTeleprompterDocument(TEACHING_SESSION_SCRIPT);
  assert.equal(sections.length, 9);
  for (const [index, section] of sections.entries()) {
    assert.match(section.heading ?? "", new RegExp(`^${index + 1}\\. `));
    assert.ok((section.reference ?? "").length >= 12, `Section ${index + 1} has references`);
    assert.ok((section.note ?? "").length >= 20, `Section ${index + 1} has speaking guidance`);
    assert.ok(section.body.some((line) => line.startsWith("• ")), `Section ${index + 1} has points`);
  }
  const allLines = TEACHING_SESSION_SCRIPT.split("\n");
    // References and private notes are not lens-reading body copy.
  const longPrompts = allLines.filter((line) =>
    !line.startsWith("@ref ") && !line.startsWith("@note ") && line.length > 72,
  );
  assert.deepEqual(longPrompts, []);
  assert.match(TEACHING_SESSION_SCRIPT, /John 17:1/);
  assert.match(TEACHING_SESSION_SCRIPT, /John 17:1-5,24/);
  assert.match(TEACHING_SESSION_SCRIPT, /Luke 22:41-44/);
  assert.match(TEACHING_SESSION_SCRIPT, /1 Timothy 2:5/);
  assert.match(TEACHING_SESSION_SCRIPT, /the Father/);
});

test("first opening saves every old document in JSON and replaces active library once", () => {
  const oldDocuments = [
    { id: "old-1", title: "Previous script", content: "Manuscript", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "old-2", title: "My own script", content: "Edited", createdAt: "2026-01-02", updatedAt: "2026-01-02" },
  ];
  const previous = JSON.stringify(oldDocuments);
  const store = memoryStorage({
    [TELEPROMPTER_STORAGE_KEY]: previous,
    [TELEPROMPTER_LAST_DOCUMENT_KEY]: "old-2",
  });
  const active = migrateToTeachingGuide(store);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, TEACHING_SESSION_ID);
  assert.equal(store.getItem(TELEPROMPTER_PREVIOUS_SCRIPTS_KEY), previous);
  assert.equal(store.getItem(TELEPROMPTER_LAST_DOCUMENT_KEY), TEACHING_SESSION_ID);
  assert.equal(store.getItem(TELEPROMPTER_TEACHING_RESET_KEY), TEACHING_SESSION_VERSION);

  const edited = [{ ...active[0], content: "# Edited live\nMy new teaching notes" }];
  store.setItem(TELEPROMPTER_STORAGE_KEY, JSON.stringify(edited));
  const next = migrateToTeachingGuide(store);
  assert.equal(next[0].content, edited[0].content);
  assert.equal(store.getItem(TELEPROMPTER_PREVIOUS_SCRIPTS_KEY), previous);
});

test("a clean device initializes without a fake old-script backup", () => {
  const store = memoryStorage();
  const active = migrateToTeachingGuide(store);
  assert.equal(active.length, 1);
  assert.equal(store.getItem(TELEPROMPTER_PREVIOUS_SCRIPTS_KEY), null);
});

test("if a backup cannot be written, old active scripts are not destroyed", () => {
  const oldRaw = JSON.stringify([{ id: "previous" }]);
  const values = memoryStorage({ [TELEPROMPTER_STORAGE_KEY]: oldRaw });
  const guarded = {
    getItem: values.getItem,
    setItem: (key: string, value: string) => {
      if (key === TELEPROMPTER_PREVIOUS_SCRIPTS_KEY) throw new Error("Quota exceeded");
      values.setItem(key, value);
    },
  };
  assert.throws(() => migrateToTeachingGuide(guarded), /Quota exceeded/);
  assert.equal(values.getItem(TELEPROMPTER_STORAGE_KEY), oldRaw);
  assert.equal(values.getItem(TELEPROMPTER_TEACHING_RESET_KEY), null);
});

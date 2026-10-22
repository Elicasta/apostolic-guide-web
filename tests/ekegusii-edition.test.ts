import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { allPathways } from "../src/pathway-catalog";
import { safeDrafts, filledStepCount } from "../src/ekegusii-edition";

test("Ekegusii edition maps the full canonical Pathway library, without changing it", () => {
  assert.equal(allPathways.length, 20);
  assert.equal(allPathways.reduce((sum, item) => sum + item.steps.length, 0), 106);
  assert.equal(new Set(allPathways.map((item) => item.slug)).size, 20);
});
test("review edition is unindexed and isolated from default navigation", () => {
  const layout = readFileSync("app/ekegusii/layout.tsx", "utf8");
  const css = readFileSync("app/ekegusii/ekegusii.css", "utf8");
  assert.match(layout, /index: false/);
  assert.match(css, /body:has\(\.eg-shell\) \.site-header/);
  assert.match(css, /\.eg-reader-grid/);
});
test("reviews cannot silently appear as approved translations", () => {
  const reader = readFileSync("src/ekegusii-edition.tsx", "utf8");
  assert.match(reader, /TRANSLATION PENDING/);
  assert.match(reader, /Export review/);
  assert.match(reader, /not published/);
  assert.match(reader, /localStorage/);
  assert.doesNotMatch(reader, /supabase\.from/);
});
test("imported review content is shape checked and has explicit language and version", () => {
  const input = { "god-is-one": { title: "test", steps: { "0": { title: "a", explanation: "b", hook: "c" } } }, "bad/route": { title: "bad" } };
  const output = safeDrafts(input);
  assert.deepEqual(Object.keys(output), ["god-is-one"]);
  assert.equal(filledStepCount(output["god-is-one"]), 1);
  assert.equal(filledStepCount(output["bad/route"]), 0);
});

import { ekegusiiSeedDrafts } from "../src/ekegusii-seed-drafts";

test("all 20 Pathways and all 106 canonical steps have a ready Ekegusii AI draft", () => {
  const slugs = allPathways.map((item) => item.slug).sort();
  assert.deepEqual(Object.keys(ekegusiiSeedDrafts).sort(), slugs);
  let reviewedSteps = 0;
  for (const study of allPathways) {
    const draft = ekegusiiSeedDrafts[study.slug];
    assert.ok(draft?.title?.trim(), study.slug + ": missing title");
    assert.ok(draft?.summary?.trim(), study.slug + ": missing summary");
    assert.equal(Object.keys(draft.steps).length, study.steps.length, study.slug + ": step count");
    study.steps.forEach((source, index) => {
      const value = draft.steps[String(index)];
      assert.ok(source.reference, study.slug + ": missing canonical Scripture reference");
      assert.ok(value?.title?.trim(), study.slug + ": missing step title " + index);
      assert.ok(value?.explanation?.trim(), study.slug + ": missing explanation " + index);
      assert.ok(value?.hook?.trim(), study.slug + ": missing transition " + index);
      reviewedSteps++;
    });
  }
  assert.equal(reviewedSteps, 106);
});

test("reading is the default for every Pathway; correction editor is an opt-in", () => {
  const reader = readFileSync("src/ekegusii-edition.tsx", "utf8");
  const pathway = readFileSync("app/ekegusii/pathways/[slug]/page.tsx", "utf8");
  assert.match(reader, /useState<"read" \| "edit">\("read"\)/);
  assert.match(reader, /showTools={mode === "edit"}/);
  assert.match(reader, /Suggest corrections/);
  assert.match(reader, /eg-next-pathway/);
  assert.match(reader, /selectStep\(next\)/);
  assert.match(pathway, /seed={bibleSourcedEkegusiiSeed\(slug\)}/);
});

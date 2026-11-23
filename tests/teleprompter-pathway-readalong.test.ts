import assert from "node:assert/strict";
import test from "node:test";
import { allPathways } from "../src/pathway-catalog";
import { getPathwayKjvPassage } from "../src/pathway-kjv";
import { parseTeleprompterDocument } from "../src/lib/teleprompter/parser";
import {
  buildPathwayReadAlongScript,
  getPathwaySeedDocuments,
  getPathwaySeedSignatures,
  pathwayDocumentId,
  pathwayDocumentSignature,
  pathwayDocumentTitle,
  pathwayFromDocumentId,
  publicPathwayUrl,
  TELEPROMPTER_PATHWAY_SEED_KEY,
  TELEPROMPTER_PATHWAY_SIGNATURES_KEY,
} from "../src/lib/teleprompter/pathways";
import { loadTeleprompterDocuments, mergePathwayReadAlongs } from "../src/lib/teleprompter/seeded-storage";
import { TELEPROMPTER_STORAGE_KEY, selectTeleprompterDocument } from "../src/lib/teleprompter/storage";
import type { TeleprompterDocument } from "../src/lib/teleprompter/types";

const seeds = getPathwaySeedDocuments();

test("the public website and the read-along series share the exact same 20 Pathway slugs in order", () => {
  assert.equal(allPathways.length, 20);
  assert.equal(seeds.length, allPathways.length);
  assert.equal(new Set(seeds.map((seed) => seed.id)).size, 20);
  assert.deepEqual(
    seeds.map((seed) => seed.id),
    allPathways.map((pathway) => pathwayDocumentId(pathway.slug)),
  );
  allPathways.forEach((pathway, index) => {
    assert.equal(seeds[index].title, pathwayDocumentTitle(pathway, index));
    assert.deepEqual(pathwayFromDocumentId(seeds[index].id), pathway);
    assert.equal(publicPathwayUrl(pathway.slug), `https://www.apostolicguide.com/pathways/${pathway.slug}`);
  });
  assert.equal(pathwayFromDocumentId("ag-doctrine-ep-01"), undefined);
});

test("all 106 public study steps use the word-for-word online Scripture, explanation and hook", () => {
  let stepCount = 0;
  allPathways.forEach((pathway, index) => {
    const document = seeds[index];
    assert.equal(document.content, buildPathwayReadAlongScript(pathway));
    const slides = parseTeleprompterDocument(document.content);
    assert.equal(slides.length, pathway.steps.length + 2, pathway.title);
    assert.equal(slides[0].heading, pathway.title);
    assert.ok(slides[0].body.join(" ").includes("Welcome to Apostolic Guide."), pathway.title);
    assert.ok(slides[0].body.join(" ").includes(pathway.summary), pathway.title);
    const url = publicPathwayUrl(pathway.slug);
    assert.ok(slides[0].body.join(" ").includes(url), pathway.title);
    assert.ok(slides.at(-1)?.body.join(" ").includes(url), pathway.title);
    assert.equal(document.content.includes("/paths/"), false, pathway.title);
    assert.equal(document.content.includes("youtube.com"), false, pathway.title);
    assert.equal(document.content.includes("Download the app"), false, pathway.title);

    pathway.steps.forEach((step, stepIndex) => {
      stepCount += 1;
      const slide = slides[stepIndex + 1];
      const scripture = getPathwayKjvPassage(step.reference);
      assert.ok(scripture?.verses.length, `${pathway.title}: missing KJV ${step.reference}`);
      const visibleKjv = scripture.verses.map((verse) => `${verse.number} ${verse.text}`);
      const next = pathway.steps[stepIndex + 1];
      const hook = step.hook ??
        (next ? `${next.reference} takes the next step in the study: ${next.title}.` : "");
      assert.equal(slide.heading, step.title, `${pathway.title} step ${stepIndex + 1}`);
      assert.equal(slide.reference, step.reference, `${pathway.title} step ${stepIndex + 1}`);
      assert.deepEqual(slide.quotes, visibleKjv, `${pathway.title} KJV ${step.reference}`);
      assert.deepEqual(
        slide.body,
        [...visibleKjv, step.explanation, ...(hook ? [hook] : [])],
        `${pathway.title}: script must not paraphrase ${step.reference}`,
      );
    });
    assert.match(slides.at(-1)?.note ?? "", /CTA/);
    assert.match(slides[0].note ?? "", /INTRO/);
  });
  assert.equal(stepCount, 106);
});

test("public Pathway source changes update only unedited copies and preserve deletions", () => {
  const [original, second] = seeds;
  const custom: TeleprompterDocument = {
    ...original,
    id: "my-sunday-notes",
    title: "Sunday",
    content: "# My notes",
  };
  const edited = { ...second, content: second.content + "\nEli's own clarification." };
  const signatures = getPathwaySeedSignatures();
  const updatedOriginal = { ...original, content: original.content + "\nAn updated source paragraph." };
  const updatedSecond = { ...second, content: second.content + "\nPublic site amendment." };
  const result = mergePathwayReadAlongs(
    [original, edited, custom],
    signatures,
    [updatedOriginal, updatedSecond],
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].content, updatedOriginal.content);
  assert.equal(result[0].createdAt, original.createdAt);
  assert.deepEqual(result[1], edited);
  assert.deepEqual(result[2], custom);
  assert.equal(result.some((item) => item.id === seeds[2].id), false);
  assert.deepEqual(mergePathwayReadAlongs(result, getPathwaySeedSignatures([updatedOriginal, updatedSecond]), [updatedOriginal, updatedSecond]), result);
});

test("first install never overwrites an existing Pathway ID", () => {
  const edited = { ...seeds[0], title: "My recorded version", content: "# My own draft" };
  const installed = mergePathwayReadAlongs([edited], null);
  assert.equal(installed.length, 20);
  assert.deepEqual(installed.find((document) => document.id === edited.id), edited);
  assert.equal(installed.filter((document) => document.id === edited.id).length, 1);
  assert.equal(pathwayDocumentSignature(edited) === pathwayDocumentSignature(seeds[0]), false);
});

function fakeBrowser(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });
  return values;
}
function cleanup() { delete (globalThis as { window?: unknown }).window; }

test("existing browser receives Pathways once and defaults to the actual read-along", () => {
  const values = fakeBrowser();
  try {
    const loaded = loadTeleprompterDocuments();
    assert.equal(loaded.filter((document) => document.id.startsWith("ag-pathway-")).length, 20);
    assert.equal(selectTeleprompterDocument(loaded)?.id, seeds[0].id);
    assert.equal(values.get(TELEPROMPTER_PATHWAY_SEED_KEY), "1");
    assert.deepEqual(JSON.parse(values.get(TELEPROMPTER_PATHWAY_SIGNATURES_KEY) ?? "{}"), getPathwaySeedSignatures());
    assert.deepEqual(loadTeleprompterDocuments(), loaded);
    assert.deepEqual(JSON.parse(values.get(TELEPROMPTER_STORAGE_KEY) ?? "[]"), loaded);
    values.set(TELEPROMPTER_STORAGE_KEY, JSON.stringify(loaded.filter((document) => document.id !== seeds[1].id)));
    assert.equal(loadTeleprompterDocuments().some((doc) => doc.id === seeds[1].id), false);
  } finally { cleanup(); }
});

test("a browser with edited Pathway scripts keeps those changes on reload", () => {
  const edited = { ...seeds[0], content: "# My edited spoken script" };
  const values = fakeBrowser({
    [TELEPROMPTER_STORAGE_KEY]: JSON.stringify([edited, seeds[1]]),
    [TELEPROMPTER_PATHWAY_SEED_KEY]: "1",
    [TELEPROMPTER_PATHWAY_SIGNATURES_KEY]: JSON.stringify(getPathwaySeedSignatures()),
  });
  try {
    const loaded = loadTeleprompterDocuments();
    assert.deepEqual(loaded.find((document) => document.id === edited.id), edited);
    assert.deepEqual(loadTeleprompterDocuments().find((document) => document.id === edited.id), edited);
    assert.equal(values.get(TELEPROMPTER_PATHWAY_SEED_KEY), "1");
  } finally { cleanup(); }
});

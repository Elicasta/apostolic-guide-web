import assert from "node:assert/strict";
import test from "node:test";
import { allPathways, pathwayBySlug } from "../src/pathway-catalog";

function wordCount(value: string) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

test("every Pathway has meaningful Scripture-grounded What This Shows teaching", () => {
  assert.ok(allPathways.length >= 20, "An existing Pathway disappeared from the catalog");

  const slugs = new Set<string>();
  let reviewedSteps = 0;
  for (const pathway of allPathways) {
    assert.ok(!slugs.has(pathway.slug), `Duplicate pathway: ${pathway.slug}`);
    slugs.add(pathway.slug);
    assert.ok(pathway.steps.length >= 5, `${pathway.slug}: expected a complete study sequence`);
    const references = new Set<string>();
    for (const step of pathway.steps) {
      const location = `${pathway.slug} / ${step.reference}`;
      assert.ok(step.title.trim().length > 0, `${location}: missing step title`);
      assert.ok(step.reference.trim().length > 0, `${location}: missing Scripture reference`);
      assert.ok(!references.has(step.reference), `${location}: duplicate reference within the pathway`);
      references.add(step.reference);

      const teaching = step.explanation?.trim() ?? "";
      assert.ok(
        wordCount(teaching) >= 55,
        `${location}: What This Shows needs a contextual explanation, not a one-line claim (${wordCount(teaching)} words)`
      );
      assert.ok(
        wordCount(teaching) <= 135,
        `${location}: the teaching is too long for a single mobile reading card`
      );
      assert.ok(
        teaching.includes(".") && !teaching.includes("..."),
        `${location}: finish the explanation; do not use placeholder copy`
      );
      assert.ok(step.hook?.trim(), `${location}: the next-step reasoning was lost`);
      reviewedSteps += 1;
    }
  }
  assert.ok(reviewedSteps >= 106, `Expected every existing study step; found ${reviewedSteps}`);
});

test("sensitive doctrinal explanations use the surrounding passage, not an isolated proof-text", () => {
  const jesus = pathwayBySlug("jesus-is-god");
  const john = jesus?.steps.find((step) => step.reference === "John 1:1")?.explanation ?? "";
  assert.match(john, /with God/i);
  assert.match(john, /was God/i);
  assert.match(john, /verse 14/i);

  const commission = pathwayBySlug("matthew-28-and-acts-2");
  const matthew = commission?.steps.find((step) => step.reference === "Matthew 28:19")?.explanation ?? "";
  assert.match(matthew, /singular/i);
  assert.match(matthew, /not from the singular noun alone/i);

  const tongues = pathwayBySlug("tongues-as-initial-sign");
  const corinthians = tongues?.steps.find((step) => step.reference === "1 Corinthians 12:30")?.explanation ?? "";
  assert.match(corinthians, /interpretation/i);
  assert.match(corinthians, /Paul/i);
});

test("the public Pathway card shows the canonical explanation without truncation or hiding it", async () => {
  const { readFileSync } = await import("node:fs");
  const reader = readFileSync("src/pathway-card-reader.tsx", "utf8");
  const route = readFileSync("app/pathways/[slug]/page.tsx", "utf8");
  assert.match(reader, /What this shows/);
  assert.match(reader, /<p>\{step\.explanation\}<\/p>/);
  assert.match(route, /<PathwayCardReader/);
  assert.match(route, /steps=\{readerSteps\}/);
});

function explanation(slug: string, reference: string) {
  const pathway = pathwayBySlug(slug);
  assert.ok(pathway, `Missing doctrinal pathway: ${slug}`);
  const step = pathway.steps.find((item) => item.reference === reference);
  assert.ok(step, `Missing doctrinal reference: ${slug} / ${reference}`);
  return step.explanation;
}

test("doctrinal audit preserves God's identity instead of describing the Word as a created bearer of deity", () => {
  const john = explanation("jesus-is-god", "John 1:1");
  assert.match(john, /the Word was with God, and the Word was God/i);
  assert.match(john, /not a created being/i);
  assert.match(john, /Word was made flesh/i);

  const incarnation = explanation("word-became-flesh", "John 1:1");
  assert.match(incarnation, /Word was God/i);
  assert.match(incarnation, /Apostolic Oneness theology understands/i);

  const fullness = explanation("fullness-of-godhead", "Colossians 2:9");
  assert.match(fullness, /all the fullness of the Godhead dwells in Christ bodily/i);
  assert.match(fullness, /not a partial gift of divinity/i);

  const seeingFather = explanation("father-dwells-in-son", "John 14:9");
  assert.match(seeingFather, /seen me hath seen the Father/i);
  assert.match(seeingFather, /Father dwells in Him/i);
});

test("doctrinal audit marks debated inferences instead of misquoting a proof text", () => {
  const commission = explanation("matthew-28-and-acts-2", "Matthew 28:19");
  assert.match(commission, /verse itself names those three designations/i);
  assert.match(commission, /not from the singular noun alone/i);

  const water = explanation("new-birth", "John 3:5");
  assert.match(water, /exact meaning of 'water' is debated/i);
  assert.match(water, /Apostolic Oneness teaching connects/i);

  const gifts = explanation("tongues-as-initial-sign", "1 Corinthians 12:30");
  assert.match(gifts, /distinguishes this congregational gift/i);
  assert.match(gifts, /interpretation of the different contexts/i);

  const spirit = explanation("receiving-the-holy-ghost", "John 14:16–18");
  assert.match(spirit, /another Comforter/i);
  assert.match(spirit, /I will come to you/i);

  const throne = explanation("right-hand-of-god", "Psalm 110:1");
  assert.match(throne, /genuinely distinguishes/i);
  assert.match(throne, /real exaltation and kingship/i);
});

test("doctrinal audit teaches real human prayer and distinguishes monotheism from caricatures", () => {
  const prayer = explanation("jesus-prayers-and-humanity", "Matthew 26:39");
  assert.match(prayer, /genuine, not a staged conversation/i);
  assert.match(prayer, /human will of the incarnate Son/i);

  const paul = explanation("no-god-beside-him", "1 Corinthians 8:4");
  assert.match(paul, /neither Trinitarian nor Oneness Christians teach that/i);

  const grace = explanation("faith-grace-and-obedience", "Ephesians 2:8–10");
  assert.match(grace, /not a human achievement/i);
  assert.match(grace, /Repentance, baptism, and Spirit-filled living/i);
});

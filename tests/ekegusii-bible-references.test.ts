import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { allPathways } from "../src/pathway-catalog";
import { displayEkegusiiBibleReference, ekegusiiBibleReference } from "../src/ekegusii-bible-references";

test("all 106 teaching Scripture references use the Bible Society's Ekegusii names and link to chapters", () => {
  let count = 0;
  const books = new Set<string>();
  for (const pathway of allPathways) {
    for (const step of pathway.steps) {
      const link = ekegusiiBibleReference(step.reference);
      assert.ok(link, pathway.slug + ": unmapped reference " + step.reference);
      assert.match(link.label, /\d+:\d+/);
      assert.match(link.url, /^https:\/\/ebible\.org\/guz\/[A-Z1-9]{3}\d{2,3}\.htm$/);
      const canonicalBook = step.reference.match(/^(.+?) \d+:/)?.[1];
      assert.notEqual(link.book, canonicalBook, step.reference + ": still English");
      books.add(link.book);
      count++;
    }
  }
  assert.equal(count, 106);
  assert.equal(books.size, 22);
});

test("book names and chapter URL padding match Ekegusii eBible source", () => {
  assert.deepEqual(ekegusiiBibleReference("Deuteronomy 6:4"), {
    canonical: "Deuteronomy 6:4",
    label: "Okoiranerera 6:4",
    book: "Okoiranerera",
    chapter: 6,
    url: "https://ebible.org/guz/DEU06.htm",
  });
  assert.equal(ekegusiiBibleReference("Psalm 33:6")?.url, "https://ebible.org/guz/PSA033.htm");
  assert.equal(ekegusiiBibleReference("John 1:1")?.url, "https://ebible.org/guz/JHN01.htm");
  assert.equal(ekegusiiBibleReference("1 Corinthians 8:4")?.url, "https://ebible.org/guz/1CO08.htm");
  assert.equal(ekegusiiBibleReference("Acts 2:38")?.label, "Ogokora Kw’abatomwa 2:38");
  assert.equal(ekegusiiBibleReference("Philippians 2:9–11")?.url, "https://ebible.org/guz/PHP02.htm");
  assert.equal(displayEkegusiiBibleReference("bad reference"), "bad reference");
  assert.equal(ekegusiiBibleReference("Unknown 12:3"), null);
});

test("Ekegusii home page shows only translated study titles and the exact Draft translation label", () => {
  const ui = readFileSync("src/ekegusii-edition.tsx", "utf8");
  assert.match(ui, /<h4 lang="guz">\{drafts\[pathway\.slug\]/);
  assert.doesNotMatch(ui, /eg-card-english/);
  assert.match(ui, /<span>Draft translation<\/span>/);
  assert.doesNotMatch(ui, /AI TRANSLATION · REVIEW PENDING/);
  assert.match(ui, /ekegusiiBibleReference\(original\.reference\)/);
  assert.match(ui, /href=\{linkedBibleReference\.url\}/);
});

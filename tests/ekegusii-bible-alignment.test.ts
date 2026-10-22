import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { allPathways } from "../src/pathway-catalog";
import { ekegusiiSeedDrafts } from "../src/ekegusii-seed-drafts";
import {
  ekegusiiBibleGlossary,
  localizeReferenceMentions,
  rebaseReviewerDrafts,
  reviewWarnings,
  revisedEkegusiiSeed,
  verifiedEkegusiiExcerpt,
} from "../src/ekegusii-language-audit";
import { ekegusiiBibleReference } from "../src/ekegusii-bible-references";

test("two different checked Scripture wordings do not inherit AI-invented quotations", () => {
  const deuteronomy = verifiedEkegusiiExcerpt("Deuteronomy 6:4");
  const mark = verifiedEkegusiiExcerpt("Mark 12:29");
  assert.match(deuteronomy?.text ?? "", /^Inwe Abaisraeli, tegerera moigwe!/);
  assert.match(deuteronomy?.text ?? "", /Omonene Nyasae oito, nere bweka Omonene/);
  assert.match(mark?.text ?? "", /^Igwa, Abaisraeli,/);
  assert.notEqual(mark?.text, deuteronomy?.text);
  assert.match(deuteronomy?.source ?? "", /Bible Society of Kenya/);
  assert.equal(verifiedEkegusiiExcerpt("Acts 2:38"), null);
  const revised = revisedEkegusiiSeed("god-is-one");
  assert.doesNotMatch(revised.steps?.["0"]?.explanation ?? "", /TENDEKENI, ABAISRAELI|NYASAEE OMOKA/);
  assert.doesNotMatch(revised.steps?.["3"]?.explanation ?? "", /"Tendekeni, Abaisraeli/);
});

test("Bible-attested glossary is source-linked and model-only terminology is not treated as verified", () => {
  assert.ok(ekegusiiBibleGlossary.length >= 14);
  for (const entry of ekegusiiBibleGlossary) {
    assert.ok(ekegusiiBibleReference(entry.reference), entry.english);
    assert.ok(entry.ekegusii.trim().length >= 4);
  }
  assert.ok(ekegusiiBibleGlossary.find((e) => e.english === "Holy Spirit")?.ekegusii === "Omoika Omochenu");
  assert.match(revisedEkegusiiSeed("word-became-flesh").title ?? "", /Ring’ana/);
  assert.match(revisedEkegusiiSeed("new-birth").title ?? "", /Koiborwa/);
  assert.equal(localizeReferenceMentions("John 1:14; Acts 2:38"), "Yohana 1:14; Ogokora Kw’abatomwa 2:38");
  assert.ok(reviewWarnings("god-is-one", 0).length);
  assert.ok(reviewWarnings("tongues-as-initial-sign", 5).length);
});

test("all 20 draft Pathways preserve the canonical 106 steps and their direct source links", () => {
  let checked = 0;
  for (const study of allPathways) {
    const draft = revisedEkegusiiSeed(study.slug);
    assert.ok(draft.title);
    assert.ok(draft.summary);
    assert.equal(Object.keys(draft.steps ?? {}).length, study.steps.length);
    for (let i = 0; i < study.steps.length; i++) {
      assert.ok(draft.steps?.[String(i)]?.explanation?.trim());
      assert.ok(draft.steps?.[String(i)]?.title?.trim());
      assert.ok(ekegusiiBibleReference(study.steps[i].reference));
      checked++;
    }
  }
  assert.equal(checked, 106);
  assert.equal(Object.keys(ekegusiiSeedDrafts).length, 20);
});

test("legacy migration accepts Bible-grounded fixes while preserving real human edits", () => {
  const old = ekegusiiSeedDrafts["god-is-one"];
  const original = {
    "god-is-one": {
      title: old.title,
      summary: old.summary,
      steps: {
        "0": { ...old.steps["0"] },
        "1": { ...old.steps["1"], explanation: "Pastor's independently corrected wording" },
        "3": { ...old.steps["3"] },
      },
    },
  };
  const rebased = rebaseReviewerDrafts(original)["god-is-one"];
  const current = revisedEkegusiiSeed("god-is-one");
  assert.equal(rebased.title, current.title);
  assert.equal(rebased.steps?.["0"]?.explanation, current.steps?.["0"]?.explanation);
  assert.equal(rebased.steps?.["1"]?.explanation, "Pastor's independently corrected wording");
  assert.equal(rebased.steps?.["3"]?.explanation, current.steps?.["3"]?.explanation);
  assert.match(readFileSync("src/ekegusii-edition.tsx","utf8"), /LEGACY_DRAFT_KEY/);
  assert.match(readFileSync("src/ekegusii-edition.tsx","utf8"), /rebaseReviewerDrafts/);
});

test("lesson source notes separate manuscript interpretation from a Bible quotation", () => {
  const ui = readFileSync("src/ekegusii-edition.tsx","utf8");
  assert.match(ui, /eg-bible-excerpt/);
  assert.match(ui, /eg-source-footnotes/);
  assert.match(ui, /© 2021 Bible Society of Kenya/);
  assert.match(ui, /Teaching explanation is a draft, not a Bible quotation/);
  assert.match(ui, /Compare with the approved English teaching/);
  assert.match(ui, /Priority translation review/);
  assert.doesNotMatch(ui, /supabase\.from/);
});

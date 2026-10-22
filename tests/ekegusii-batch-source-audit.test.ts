import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { allPathways } from "../src/pathway-catalog";
import { ekegusiiSeedDrafts } from "../src/ekegusii-seed-drafts";
import { 
  bibleSourcedEkegusiiSeed, sourceAlignmentRisks,
  referenceOfStep, verifiedEkegusiiExcerpt,
  rebaseV2ReviewerDrafts, revisedEkegusiiSeed,
  standardizeBibleVocabulary 
} from "../src/ekegusii-language-audit";

test("the third source alignment revision covers all 106 without fabricating Bible quotations", () => {
  let seen = 0;
  for (const pathway of allPathways) {
    const baseline = bibleSourcedEkegusiiSeed(pathway.slug);
    assert.ok(baseline.title);
    assert.equal(Object.keys(baseline.steps ?? {}).length, pathway.steps.length);
    for (let i = 0; i < pathway.steps.length; i++) {
      const source = baseline.steps?.[String(i)];
      assert.ok(source);
      assert.ok(source.title?.trim());
      assert.ok(source?.explanation?.trim());
      assert.equal(referenceOfStep(pathway.slug, i), pathway.steps[i].reference);
      assert.doesNotMatch(source.explanation ?? "", /\b(?:Holy Ghost|Holy Spirit|Ngai|Matthew|Isaiah|Jesus|Peter|John|Luke|Paul)\b/);
      if (!verifiedEkegusiiExcerpt(pathway.steps[i].reference))
        assert.doesNotMatch(source.explanation ?? "", /"[^"\n]{6,220}"|“[^”\n]{6,220}”|‘[^’\n]{6,220}’/);
      seen++;
    }
  }
  assert.equal(seen, 106);
});

test("published version and sample Scripture source are correct", () => {
  const excerpt = verifiedEkegusiiExcerpt("Acts 4:12");
  assert.match(excerpt?.text ?? "", /^Ogotoreka nigo gokonyorekana/);
  assert.match(excerpt?.source ?? "", /2021 Bible Society of Kenya/);
  assert.equal(verifiedEkegusiiExcerpt("Acts 2:38"), null);
  assert.equal(verifiedEkegusiiExcerpt("Isaiah 43:10"), null);
  assert.match(readFileSync("src/ekegusii-edition.tsx", "utf8"), /2925-ekge-ebibilia-enchenu/);
});

test("natural-language risk warnings are not confused with linguistic approval", () => {
  const riskiest = allPathways.flatMap(p => p.steps.map((_,i) => sourceAlignmentRisks(p.slug,i))).filter(w => w.length);
  assert.ok(riskiest.length > 50);
  assert.ok(sourceAlignmentRisks("baptism-in-jesus-name", 4).length > 0);
  assert.match(standardizeBibleVocabulary("Peter and John",), /Petero and Yohana/);
  const ui = readFileSync("src/ekegusii-edition.tsx","utf8");
  assert.match(ui,/Translation review needed/);
  assert.match(ui,/Bible wording not yet compared/);
  assert.doesNotMatch(ui,/automatically approved/);
});

test("v2 reviewer improvements survive v3 baseline and unchanged drafts update", () => {
  const old = revisedEkegusiiSeed("god-is-one");
  const human = "Reviewed Ekegusii sentence supplied by pastor";
  const result = rebaseV2ReviewerDrafts({ "god-is-one": {
    title:old.title, summary:old.summary, steps:{
      "0": { ...old.steps?.["0"] },
      "2": { ...old.steps?.["2"], explanation: human }
    }
  }})["god-is-one"];
  assert.equal(result.steps?.["2"].explanation,human);
  assert.equal(result.steps?.["0"].explanation,bibleSourcedEkegusiiSeed("god-is-one").steps?.["0"].explanation);
  assert.equal(result.title,bibleSourcedEkegusiiSeed("god-is-one").title);
  assert.match(readFileSync("src/ekegusii-edition.tsx","utf8"), /review-v3/);
});

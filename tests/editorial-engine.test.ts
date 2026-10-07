import assert from "node:assert/strict";
import test from "node:test";
import { allPathways } from "../src/pathway-catalog";
import { getPathwayKjvPassage } from "../src/pathway-kjv";
import { addEditorialDays, buildEditorialPack, buildEditorialWindow, dateOrdinal, editorialDate, editorialSourceHash, EDITORIAL_ROTATION, splitEditorialText } from "../src/editorial-engine";
import { readKjvPassage, scriptureEmphasisParts } from "../src/kjv-reader";
import { extractScriptureReferences } from "../src/scripture-references";
import corpus from "../src/scripture-data/kjv.json";
import { answers, articles, topics } from "../src/data";
import { renderForgeFrameSvg } from "../src/forge-carousel-render-engine";

test("weekly rotation holds one canonical pathway and ordered teaching installments", () => {
  const packs = buildEditorialWindow("2026-10-05", 14);
  assert.deepEqual(packs.slice(0,7).map(p => p.lane), [...EDITORIAL_ROTATION]);
  assert.deepEqual(packs.slice(0,7).filter(p => p.episode).map(p => p.episode), [1,2,3]);
  assert.ok(packs.slice(0,7).every(p => p.pathwaySlug === "god-is-one"));
  assert.ok(packs.slice(7).every(p => p.pathwaySlug === "no-god-beside-him"));
  assert.equal(packs.filter(p => p.newsletter).length, 2);
});
test("complete catalog produces every scripture and explanation without truncation", () => {
  for (let week = 0; week < allPathways.length; week++) {
    const pathway = allPathways[week];
    const packs = Array.from({length:7},(_,day) => buildEditorialPack(addEditorialDays("2026-10-05",week*7+day)));
    for (const pack of packs) {
      assert.equal(pack.blockers.length, 0, pack.title);
      assert.ok(pack.frames.length > 0 && pack.frames.length <= 20, pack.title);
      assert.ok(pack.frames.every(f => f.pathwayLink === `/pathways/${pathway.slug}`));
      assert.ok(pack.frames.every(f => f.body.length <= 170), pack.title);
      assert.equal(new Set(pack.frames.map(f=>f.id)).size, pack.frames.length);
      for (const f of pack.frames) {
        const svg = renderForgeFrameSvg({frame:f,index:f.order,total:pack.frames.length,pathwayTitle:pathway.title,projectTitle:pack.title});
        assert.ok(!svg.includes("…"), `Clipped artwork: ${pack.title}, ${f.headline}`);
      }
    }
    const teaching = packs.filter(p => p.lane === "teaching").flatMap(p => p.frames);
    for (const step of pathway.steps) {
      assert.equal(teaching.filter(f=>f.scripture === step.reference).map(f=>f.body).join(" "), getPathwayKjvPassage(step.reference)!.verses.map(v=>v.text).join(" "));
    }
    assert.equal(teaching.filter(f=>f.role === "explanation").map(f=>f.body).join(" "), pathway.steps.map(s=>s.explanation).join(" "));
  }
});
test("source changes invalidate the review fingerprint", () => {
  const pathway = allPathways[0];
  assert.notEqual(editorialSourceHash(pathway), editorialSourceHash({...pathway,summary:"Changed canonical source"}));
});
test("dates follow Eastern midnight and daylight saving transitions", () => {
  assert.equal(editorialDate(new Date("2026-10-06T02:00:00Z")),"2026-10-05");
  assert.equal(editorialDate(new Date("2026-11-02T04:30:00Z")),"2026-11-01");
  assert.equal(addEditorialDays("2026-10-31",2),"2026-11-02");
  assert.throws(()=>dateOrdinal("2026-02-30"));
  assert.throws(()=>buildEditorialWindow("2026-10-05",31));
  assert.throws(()=>buildEditorialWindow("2026-10-05",0));
});
test("long scripture chunks reconstruct the original words", () => {
  const text=getPathwayKjvPassage("1 Corinthians 8:4")!.verses[0].text;
  assert.equal(splitEditorialText(text).join(" "),text);
  assert.deepEqual(scriptureEmphasisParts("GOD is one",["God","", "one"]).map(p=>p.text).join(""),"GOD is one");
});
test("local KJV reader resolves aliases and ranges without returning partial passages", () => {
  assert.equal(Object.keys(corpus).length,66);
  assert.equal(readKjvPassage(corpus,"acts 2:38–39")?.verses.length,2);
  assert.ok(readKjvPassage(corpus,"Psalm 23:1")?.verses[0].text.includes("shepherd"));
  assert.equal(readKjvPassage(corpus,"John 1:0"),null);
  assert.equal(readKjvPassage(corpus,"John 1:51-52"),null);
  assert.equal(readKjvPassage(corpus,"John 1:5-2"),null);
  assert.equal(readKjvPassage(corpus,"made up 1:1"),null);
  assert.ok(!readKjvPassage(corpus,"John 3:16")!.verses[0].text.match(/[\[\]{}]/));
});
test("all known article, answer and topic verse references resolve locally", () => {
  const refs = extractScriptureReferences({answers,articles,topics});
  assert.ok(refs.length>50);
  for(const ref of refs) assert.ok(readKjvPassage(corpus,ref), `Unresolved reference: ${ref}`);
});

test("publication guard rejects stale or blocked editorial sources without affecting other projects", async () => {
  const { assertEditorialSourceCurrent } = await import("../src/editorial-engine");
  const pack = buildEditorialPack("2026-10-05");
  const input = {pathwaySlug:pack.pathwaySlug,editorState:{generatedText:{producer:"Editorial Engine",sourceHash:pack.sourceHash,blockers:[]}}};
  assert.doesNotThrow(()=>assertEditorialSourceCurrent(input));
  assert.throws(()=>assertEditorialSourceCurrent({...input,editorState:{generatedText:{...input.editorState.generatedText,sourceHash:"old"}}}),/source changed/);
  assert.throws(()=>assertEditorialSourceCurrent({...input,editorState:{generatedText:{...input.editorState.generatedText,blockers:["Missing text"]}}}),/blockers/);
  assert.doesNotThrow(()=>assertEditorialSourceCurrent({pathwaySlug:"legacy-project",editorState:{}}));
});

test("weekly newsletters reuse related website articles and answers with working canonical URLs", async () => {
  const { buildBroadcastEmail } = await import("../src/broadcast-email");
  const newsletter = buildEditorialPack("2026-10-11").newsletter!;
  assert.ok(newsletter.resources?.length);
  for (const resource of newsletter.resources!) {
    assert.ok(resource.url.startsWith("https://www.apostolicguide.com/"));
    assert.ok(resource.summary.length <= 1200);
  }
  const email = buildBroadcastEmail(newsletter);
  assert.ok(email.html.includes(newsletter.resources![0].url));
  assert.ok(email.text.includes(newsletter.resources![0].title));
  const escaped = buildBroadcastEmail({...newsletter,resources:[{title:"<script>alert(1)</script>",summary:"A & B",url:"javascript:alert(1)"}]});
  assert.ok(!escaped.html.includes("<script>"));
  assert.ok(!escaped.html.includes('href="javascript:'));
});

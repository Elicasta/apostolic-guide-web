import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allPathways } from "../src/pathway-catalog";
import { buildEditorialPack, addEditorialDays } from "../src/editorial-engine";
import { carouselFrameLayout, carouselFitClass, cleanPublicCarouselText } from "../src/carousel-design-contract";

const read = (name: string) => readFileSync(new URL("../"+name, import.meta.url),"utf8");

test("live artboard and PNG share the exact measured headline and paragraph contract", () => {
  const editor=read("src/carousel-persistent-artwork.tsx");
  const renderer=read("src/forge-carousel-image.tsx");
  const css=read("app/admin/carousel-design-contract.css");
  assert.match(editor,/carouselFrameLayout/);
  assert.match(renderer,/carouselFrameLayout/);
  assert.match(editor,/--title-size/);
  assert.match(editor,/--body-size/);
  assert.match(css,/font-size: var\(--title-size/);
  assert.match(css,/font-size: var\(--body-size/);
  assert.match(renderer,/fontSize: layout\.headlinePx/);
  assert.match(renderer,/fontSize: layout\.bodyPx/);
  assert.match(renderer,/width: \x60\$\{layout\.bodyWidth\}%\x60/);
  assert.match(renderer,/width: \x60\$\{layout\.titleWidth\}%\x60/);
  for (const theme of ["street-theology","editorial-white","cinematic","verse-connection","manifesto"]) {
    for (const headline of ["Begin with Scripture","The LORD alone made all things in heaven and on earth","A longer statement intended to require a smaller legible headline rather than clipped exported artwork"]) {
      const a=carouselFrameLayout({theme,title:headline,body:"Read the Scripture and consider its meaning.",index:0,total:8});
      assert.equal(a.headlinePx,a.headlineCqw*10.8);
      assert.equal(a.bodyPx,a.bodyCqw*10.8);
      assert.ok(a.titleWidth<=90 && a.bodyWidth<=82);
      assert.ok(a.headlinePx>=58 && a.bodyPx>=25);
    }
  }
  assert.equal(carouselFitClass("A statement"),"fit-sm");
});

test("public artwork never reveals pipeline roles, installments or continuation counters",()=>{
  assert.equal(cleanPublicCarouselText("God Alone Is Creator · Part 2 of 3"),"God Alone Is Creator");
  assert.equal(cleanPublicCarouselText("Part 1 of 3 - The LORD is one"),"The LORD is one");
  assert.equal(cleanPublicCarouselText("Isaiah explains continued"),"Isaiah explains");
  const png=read("src/forge-carousel-image.tsx");
  assert.doesNotMatch(png,/frame\.role\.toUpperCase\(\)/);
  for(let week=0;week<Math.min(12,allPathways.length);week++) {
    for(let day=0;day<7;day++) {
      const pack=buildEditorialPack(addEditorialDays("2026-10-05",week*7+day));
      assert.equal(pack.blockers.length,0,pack.title);
      assert.doesNotMatch(pack.title,/Part \d+ of \d+/i);
      for(const frame of pack.frames) {
        assert.doesNotMatch(frame.headline,/\bHOOK\b|Part \d+ of \d+|\bcontinued\b/i);
        assert.ok(frame.headline && frame.body);
        assert.equal(frame.pathwayLink,`/pathways/${pack.pathwaySlug}`);
      }
    }
  }
});

test("canonical KJV and source-fingerprint doctrine checks remain hard release gates",()=>{
  const engine=read("src/editorial-engine.ts");
  assert.match(engine,/getPathwayKjvPassage\(step\.reference\)/);
  assert.match(engine,/editorialSourceHash\(pathway\)/);
  assert.match(engine,/generated\.blockers && generated\.blockers\.length|Array\.isArray\(generated\.blockers\)/);
  assert.match(engine,/The editorial source changed/);
});

test("editorial calendar refill respects partial unique index and refuses reviewed/scheduled overlaps",()=>{
  const sql=read("supabase/migrations/20261021170000_editorial_calendar_rebuild.sql");
  assert.match(sql,/on conflict \(source, source_ref\) where source_ref is not null do update/i);
  assert.match(sql,/old_project\.status = 'archived'/i);
  for(const protectedCol of ["scheduled_for","published_at","publication_id","asset_id"]) {
    assert.match(sql,new RegExp("studio_content_calendar_items\\."+protectedCol+" is null","i"));
  }
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/from public, anon, authenticated/);
  assert.match(sql,/to service_role/);
});

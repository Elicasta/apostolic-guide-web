import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/carousel-studio/page.tsx", "utf8");
const layout = readFileSync("app/admin/carousel-studio/layout.tsx", "utf8");
const persistentArtwork = readFileSync("src/carousel-persistent-artwork.tsx", "utf8");
const sequenceArt = readFileSync("src/carousel-single-art-director.tsx", "utf8");
const mobileFocus = readFileSync("src/carousel-studio-mobile-focus.tsx", "utf8");
const manualEdit = readFileSync("src/carousel-manual-edit.tsx", "utf8");
const mobileCss = readFileSync("app/admin/carousel-mobile-edit-v2.css", "utf8");
const inlineCss = readFileSync("app/admin/carousel-manual-inline.css", "utf8");
const restoredCss = readFileSync("app/admin/carousel-capabilities-restore.css", "utf8");

test("Single Post keeps one reliable Sol art generator while Carousel and Story get per-frame art", () => {
  assert.match(page, /CarouselPersistentArtwork/);
  assert.match(page, /CarouselSingleArtDirector/);
  assert.match(persistentArtwork, /projectInfo\?\.format === "single"/);
  assert.match(persistentArtwork, /Generate art with Sol/);
  assert.match(sequenceArt, /project\.format === "single"/);
  assert.match(sequenceArt, /return null/);
  assert.match(sequenceArt, /frameId: currentFrame\.id/);
  assert.match(sequenceArt, /background-direct/);
});

test("Single Post removes the meaningless Structure card from mobile focus", () => {
  assert.match(mobileFocus, /key === "structure" && single/);
  assert.match(mobileFocus, /card\.hidden = true/);
  assert.match(mobileFocus, /nextAvailable\.includes\(current\)/);
});

test("Manual Edit targets slide styling directly under Preview and pins only the artwork", () => {
  assert.match(manualEdit, /carousel-inline-manual-host/);
  assert.match(manualEdit, /creative-preview-panel/);
  assert.match(manualEdit, /Background texture/);
  assert.match(inlineCss, /creative-frame-preview[\s\S]*position:sticky!important/);
  assert.match(inlineCss, /Pin the actual artwork, not the whole preview card/);
  assert.match(inlineCss, /carousel-inline-manual-panel/);
  assert.match(restoredCss, /persistent-carousel-artboard\[data-manual-typography="true"\]/);
});

test("Draft delete remains visible in the mobile library", () => {
  assert.match(mobileCss, /creative-library-actions[\s\S]*display:flex!important/);
  assert.match(mobileCss, /button\.is-delete::after/);
  assert.match(mobileCss, /content:"Delete"/);
});

test("Route loads final capability restoration after all older Carousel mobile/manual styles", () => {
  const solIndex = layout.indexOf("carousel-single-sol-art.css");
  const mobileIndex = layout.indexOf("carousel-mobile-edit-v2.css");
  const inlineIndex = layout.indexOf("carousel-manual-inline.css");
  const restoredIndex = layout.indexOf("carousel-capabilities-restore.css");
  assert.ok(solIndex >= 0);
  assert.ok(mobileIndex > solIndex);
  assert.ok(inlineIndex > mobileIndex);
  assert.ok(restoredIndex > inlineIndex);
});

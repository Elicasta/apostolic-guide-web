import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/carousel-studio/page.tsx", "utf8");
const layout = readFileSync("app/admin/carousel-studio/layout.tsx", "utf8");
const singleArt = readFileSync("src/carousel-single-art-director.tsx", "utf8");
const mobileFocus = readFileSync("src/carousel-studio-mobile-focus.tsx", "utf8");
const manualEdit = readFileSync("src/carousel-manual-edit.tsx", "utf8");
const mobileCss = readFileSync("app/admin/carousel-mobile-edit-v2.css", "utf8");

test("Single Post mounts the reliable Sol art generator", () => {
  assert.match(page, /CarouselSingleArtDirector/);
  assert.match(singleArt, /Generate art with Sol/);
  assert.match(singleArt, /project\.format !== "single"/);
  assert.match(singleArt, /creative-projects\/\$\{projectId\}\/artwork/);
  assert.match(singleArt, /applyBackground/);
});

test("Single Post removes the meaningless Structure card from mobile focus", () => {
  assert.match(mobileFocus, /key === "structure" && single/);
  assert.match(mobileFocus, /card\.hidden = true/);
  assert.match(mobileFocus, /nextAvailable\.includes\(current\)/);
});

test("Manual Edit targets slide styling and pins a compact preview", () => {
  assert.match(manualEdit, /carousel-manual-design-controls/);
  assert.match(manualEdit, /preview pinned/);
  assert.match(mobileCss, /data-manual-edit="open"[\s\S]*creative-preview-panel[\s\S]*position:sticky!important/);
  assert.match(mobileCss, /carousel-manual-design-controls[\s\S]*order:-110!important/);
  assert.match(mobileCss, /scroll-margin-top/);
});

test("Draft delete remains visible in the mobile library", () => {
  assert.match(mobileCss, /creative-library-actions[\s\S]*display:flex!important/);
  assert.match(mobileCss, /button\.is-delete::after/);
  assert.match(mobileCss, /content:"Delete"/);
});

test("Route loads the last-mile single and mobile CSS after the older Carousel styles", () => {
  const solIndex = layout.indexOf("carousel-single-sol-art.css");
  const mobileIndex = layout.indexOf("carousel-mobile-edit-v2.css");
  assert.ok(solIndex >= 0);
  assert.ok(mobileIndex > solIndex);
});

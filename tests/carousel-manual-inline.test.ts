import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manual = readFileSync("src/carousel-manual-edit.tsx", "utf8");
const page = readFileSync("app/admin/carousel-studio/page.tsx", "utf8");
const layout = readFileSync("app/admin/carousel-studio/layout.tsx", "utf8");
const css = readFileSync("app/admin/carousel-manual-inline.css", "utf8");
const restoredCss = readFileSync("app/admin/carousel-capabilities-restore.css", "utf8");

test("Carousel Manual Edit owns a visible persistent control surface under Preview", () => {
  assert.match(manual, /data-carousel-inline-manual-host/);
  assert.match(manual, /creative-preview-panel/);
  assert.match(manual, /Type, fonts, color, layout, texture \+ AI direction/);
  assert.match(manual, /Typography \+ color/);
  assert.match(manual, /Headline size/);
  assert.match(manual, /Body size/);
  assert.match(restoredCss, /carousel-inline-manual-host/);
  assert.match(restoredCss, /display:block!important/);
});

test("Carousel Manual Edit exposes the full texture library and persists frame design", () => {
  assert.match(manual, /CAROUSEL_TEXTURES/);
  assert.match(manual, /Background texture/);
  assert.match(manual, /Texture amount/);
  assert.match(manual, /Choose texture with Sol/);
  assert.match(manual, /Use this texture on all slides/);
  assert.match(manual, /\/frame-design/);
});

test("Carousel Studio mounts one manual editor and loads restoration CSS after older layers", () => {
  assert.match(page, /<CarouselManualEdit projectId=\{projectId\}\/>/);
  assert.doesNotMatch(page, /CarouselManualDesignControls/);
  const inlineIndex = layout.indexOf("carousel-manual-inline.css");
  const repairIndex = layout.indexOf("carousel-final-repair.css");
  const restoredIndex = layout.indexOf("carousel-capabilities-restore.css");
  assert.ok(inlineIndex >= 0);
  assert.ok(repairIndex > inlineIndex);
  assert.ok(restoredIndex > repairIndex);
  assert.match(css, /Pin the actual artwork, not the whole preview card/);
});

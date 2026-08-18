import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manual = readFileSync("src/carousel-manual-edit.tsx", "utf8");
const page = readFileSync("app/admin/carousel-studio/page.tsx", "utf8");
const layout = readFileSync("app/admin/carousel-studio/layout.tsx", "utf8");
const css = readFileSync("app/admin/carousel-manual-inline.css", "utf8");

test("Carousel Manual Edit owns a visible inline control surface under Preview", () => {
  assert.match(manual, /data-carousel-inline-manual-host/);
  assert.match(manual, /creative-preview-panel/);
  assert.match(manual, /Type, color, size, layout \+ textures/);
  assert.match(manual, /Main font color/);
  assert.match(manual, /Headline size/);
  assert.match(manual, /Body size/);
});

test("Carousel Manual Edit exposes the full texture library and persists frame design", () => {
  assert.match(manual, /CAROUSEL_TEXTURES/);
  assert.match(manual, /Background texture/);
  assert.match(manual, /Texture amount/);
  assert.match(manual, /Use this texture on all slides/);
  assert.match(manual, /\/frame-design/);
});

test("Carousel Studio mounts one manual editor and loads its final CSS last", () => {
  assert.match(page, /<CarouselManualEdit\/>/);
  assert.doesNotMatch(page, /CarouselManualDesignControls/);
  assert.match(layout, /carousel-manual-inline\.css/);
  assert.match(css, /Pin the actual artwork, not the whole preview card/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("app/admin/carousel-studio/layout.tsx", "utf8");
const mobileCss = readFileSync("app/admin/carousel-mobile-workflow-cleanup.css", "utf8");

test("Carousel Studio starts at device width without disabling accessible zoom", () => {
  assert.match(layout, /export const viewport: Viewport/);
  assert.match(layout, /initialScale:\s*1/);
  assert.doesNotMatch(layout, /maximumScale:\s*1/);
  assert.doesNotMatch(layout, /userScalable:\s*false/);
});

test("Carousel Studio restores pinch zoom while keeping scroll gestures usable", () => {
  const repair = readFileSync("app/admin/carousel-mobile-viewport-repair.css", "utf8");
  assert.match(mobileCss, /touch-action:pan-x pan-y;/);
  assert.match(repair, /touch-action: pan-x pan-y pinch-zoom !important/);
});

test("Carousel Studio mobile form controls avoid iOS focus zoom", () => {
  assert.match(mobileCss, /\.carousel-studio-master input,[\s\S]*\.carousel-studio-master textarea,[\s\S]*\.carousel-studio-master select\{[\s\S]*font-size:16px!important/);
});

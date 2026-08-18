import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("app/admin/carousel-studio/layout.tsx", "utf8");
const mobileCss = readFileSync("app/admin/carousel-mobile-workflow-cleanup.css", "utf8");

test("Carousel Studio locks the mobile browser viewport at 1x", () => {
  assert.match(layout, /export const viewport: Viewport/);
  assert.match(layout, /initialScale:\s*1/);
  assert.match(layout, /maximumScale:\s*1/);
  assert.match(layout, /userScalable:\s*false/);
});

test("Carousel Studio keeps scrolling but does not opt back into pinch zoom", () => {
  assert.match(mobileCss, /touch-action:pan-x pan-y;/);
  assert.doesNotMatch(mobileCss, /touch-action:[^;]*pinch-zoom/);
});

test("Carousel Studio mobile form controls avoid iOS focus zoom", () => {
  assert.match(mobileCss, /\.carousel-studio-master input,[\s\S]*\.carousel-studio-master textarea,[\s\S]*\.carousel-studio-master select\{[\s\S]*font-size:16px!important/);
});

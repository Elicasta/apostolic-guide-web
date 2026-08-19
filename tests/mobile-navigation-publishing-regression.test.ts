import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const studio = readFileSync("src/creative-studio-client.tsx", "utf8");
const publishing = readFileSync("src/creative-publishing-client.tsx", "utf8");
const mobileFix = readFileSync("app/admin/production-mobile-regression-fix.css", "utf8");
const adminLayout = readFileSync("app/admin/layout.tsx", "utf8");
const carouselLayout = readFileSync("app/admin/carousel-studio/layout.tsx", "utf8");

test("Carousel slide navigation remains tappable on mobile", () => {
  assert.match(studio, /onClick=\{\(\) => setSelectedFrameId\(frame\.id\)\}/);
  assert.match(mobileFix, /creative-frame-row[\s\S]*touch-action:manipulation/);
  assert.match(mobileFix, /creative-frame-rail[\s\S]*pointer-events:auto/);
});

test("Publishing stage navigation remains above mobile content and tappable", () => {
  assert.match(mobileFix, /master-publishing-switch[\s\S]*pointer-events:auto/);
  assert.match(mobileFix, /master-publishing-switch button[\s\S]*touch-action:manipulation/);
});

test("Instagram preview contains the entire render instead of cropping it", () => {
  assert.match(mobileFix, /creative-instagram-preview-media[\s\S]*overflow:hidden/);
  assert.match(mobileFix, /creative-instagram-preview-media>img[\s\S]*object-fit:contain/);
  assert.match(mobileFix, /creative-instagram-preview\.is-story[\s\S]*aspect-ratio:9\/16/);
});

test("Carousel export stage uses canonical 4:5 and 9:16 source dimensions", () => {
  assert.match(mobileFix, /creative-render-stage>\.creative-frame-preview\.is-carousel[\s\S]*width:360px/);
  assert.match(mobileFix, /height:450px/);
  assert.match(mobileFix, /creative-render-stage>\.creative-frame-preview\.is-story[\s\S]*height:640px/);
});

test("the regression layer loads last globally and inside Carousel Studio", () => {
  assert.match(adminLayout, /production-mobile-regression-fix\.css/);
  assert.ok(adminLayout.lastIndexOf("production-mobile-regression-fix.css") > adminLayout.lastIndexOf("carousel-mobile-workflow-cleanup.css"));
  assert.match(carouselLayout, /production-mobile-regression-fix\.css/);
  assert.ok(carouselLayout.lastIndexOf("production-mobile-regression-fix.css") > carouselLayout.lastIndexOf("carousel-capabilities-restore.css"));
});

test("Creative Publishing still previews saved rendered assets", () => {
  assert.match(publishing, /const firstAsset = assetUrl\(renderAssets\[0\]\)/);
  assert.match(publishing, /creative-instagram-preview-media/);
});

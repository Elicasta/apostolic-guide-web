import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const studio = readFileSync("src/creative-studio-client.tsx", "utf8");
const publishing = readFileSync("src/creative-publishing-client.tsx", "utf8");
const masterPublishing = readFileSync("app/admin/master-publishing.css", "utf8");
const guidedPublishing = readFileSync("app/admin/master-publishing-guided.css", "utf8");
const carouselRepair = readFileSync("app/admin/carousel-final-repair.css", "utf8");

test("Carousel slide navigation remains tappable on mobile", () => {
  assert.match(studio, /onClick=\{\(\) => setSelectedFrameId\(frame\.id\)\}/);
  assert.match(carouselRepair, /creative-frame-row[\s\S]*touch-action:manipulation/);
  assert.match(carouselRepair, /creative-frame-rail[\s\S]*pointer-events:auto/);
});

test("Publishing stage navigation remains above mobile content and tappable", () => {
  assert.match(masterPublishing, /master-publishing-switch[\s\S]*pointer-events:auto/);
  assert.match(masterPublishing, /master-publishing-switch button[\s\S]*touch-action:manipulation/);
});

test("Instagram preview contains the entire render instead of cropping it", () => {
  assert.match(guidedPublishing, /creative-instagram-preview-media[\s\S]*overflow:hidden/);
  assert.match(guidedPublishing, /creative-instagram-preview-media>img[\s\S]*object-fit:contain/);
  assert.match(guidedPublishing, /creative-instagram-preview\.is-story[\s\S]*aspect-ratio:9\/16/);
});

test("Carousel export stage uses canonical 4:5 and 9:16 source dimensions", () => {
  assert.match(carouselRepair, /creative-render-stage>\.creative-frame-preview\.is-carousel[\s\S]*width:360px/);
  assert.match(carouselRepair, /height:450px/);
  assert.match(carouselRepair, /creative-render-stage>\.creative-frame-preview\.is-story[\s\S]*height:640px/);
  assert.match(studio, /await renderAssets\(\)[\s\S]*router\.push\(`\/admin\/publishing\?projectId=\$\{project\.id\}`\)/);
});

// Keep the actual preview path explicit so future layout refactors do not quietly
// swap the saved render for a live DOM crop.
test("Creative Publishing still previews saved rendered assets", () => {
  assert.match(publishing, /const firstAsset = assetUrl\(renderAssets\[0\]\)/);
  assert.match(publishing, /creative-instagram-preview-media/);
});

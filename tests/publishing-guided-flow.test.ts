import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publisher = readFileSync("src/creative-publishing-client.tsx", "utf8");
const calendar = readFileSync("src/content-calendar-studio.tsx", "utf8");
const guidedCss = readFileSync("app/admin/master-publishing-guided.css", "utf8");
const manualEdit = readFileSync("src/carousel-manual-edit.tsx", "utf8");
const manualInlineCss = readFileSync("app/admin/carousel-manual-inline.css", "utf8");
const carouselPage = readFileSync("app/admin/carousel-studio/page.tsx", "utf8");
const carouselLayout = readFileSync("app/admin/carousel-studio/layout.tsx", "utf8");
const renderedAssetsRoute = readFileSync("app/api/admin/creative-projects/[projectId]/rendered-assets/route.ts", "utf8");
const projectRoute = readFileSync("app/api/admin/creative-projects/[projectId]/route.ts", "utf8");

test("Creative publishing requires a visible preview before the final publish controls", () => {
  assert.match(publisher, /type Step = "select" \| "preview" \| "publish"/);
  assert.match(publisher, /This is what is going out\./);
  assert.match(publisher, /Destination/);
  assert.match(publisher, /@apostolicguide/);
  assert.match(publisher, /Continue to Publish/);
  assert.match(publisher, /Publish to Instagram/);
  assert.match(publisher, /Back to Preview/);
});

test("Instagram feed remains a three-column 4:5 image grid with minimal engagement", () => {
  assert.match(guidedCss, /instagram-feed-grid\{grid-template-columns:repeat\(3/);
  assert.match(guidedCss, /aspect-ratio:4\/5/);
  assert.match(calendar, /instagram-feed-engagement/);
  assert.match(calendar, /Heart size=\{13\}/);
  assert.match(calendar, /MessageCircle size=\{13\}/);
  assert.match(calendar, /className="instagram-feed-media" href=\{permalink\}/);
  assert.doesNotMatch(calendar, /Open on Instagram/);
});

test("Carousel Manual Edit stays attached to Preview with persistent per-slide controls", () => {
  assert.match(carouselPage, /<CarouselManualEdit projectId=\{projectId\}\/>/);
  assert.match(manualEdit, /Manual Edit/);
  assert.match(manualEdit, /dataset\.manualEdit = "open"/);
  assert.match(manualEdit, /creative-preview-panel/);
  assert.match(manualEdit, /carousel-inline-manual-host/);
  assert.match(manualEdit, /\.creative-frame-row/);
  assert.match(manualEdit, /Background texture/);
  assert.match(manualEdit, /Typography \+ color/);
  assert.match(manualEdit, /Choose texture with Sol/);
  assert.match(manualInlineCss, /creative-frame-preview[\s\S]*position:sticky!important/);
  assert.match(carouselLayout, /carousel-manual-inline\.css/);
  assert.match(carouselLayout, /carousel-capabilities-restore\.css/);
});

test("Ready creative renders survive Publisher reloads with the exact project selected", () => {
  assert.match(renderedAssetsRoute, /access: "private"/);
  assert.match(renderedAssetsRoute, /blobAccess: "private"/);
  assert.match(renderedAssetsRoute, /privateBlobReadUrl\(blob\.pathname\)/);
  assert.match(projectRoute, /privateBlobReadUrl\(storagePath\)/);
  assert.match(projectRoute, /preview_url: previewUrl/);
  assert.match(publisher, /preview_url \|\| link\?\.asset\?\.public_url/);
  assert.match(publisher, /window\.history\.replaceState/);
  assert.match(publisher, /url\.searchParams\.set\("projectId", selectedProjectId\)/);
  assert.match(publisher, /Ready for Publish/);
  assert.match(publisher, /Reload, leave Safari, or come back later/);
});

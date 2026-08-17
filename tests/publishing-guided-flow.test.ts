import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publisher = readFileSync("src/creative-publishing-client.tsx", "utf8");
const calendar = readFileSync("src/content-calendar-studio.tsx", "utf8");
const guidedCss = readFileSync("app/admin/master-publishing-guided.css", "utf8");

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

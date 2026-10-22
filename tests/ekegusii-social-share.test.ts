import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Ekegusii has a distinct 1200x630 social image", () => {
  const img = readFileSync("app/ekegusii/opengraph-image.tsx", "utf8");
  const twitter = readFileSync("app/ekegusii/twitter-image.tsx", "utf8");
  assert.match(img, /ImageResponse/);
  assert.match(img, /width: 1200, height: 630/);
  assert.match(img, /Amang’ana a Nyasae/);
  assert.match(img, /EKEGUSII BIBLE STUDY EDITION/);
  assert.match(img, /Draft translation/);
  assert.match(img, /20 teaching Pathways · 106 Scripture steps/);
  assert.match(twitter, /from "\.\/opengraph-image"/);
});

test("Ekegusii share metadata overrides the global English preview", () => {
  const layout = readFileSync("app/ekegusii/layout.tsx", "utf8");
  const root = readFileSync("app/layout.tsx", "utf8");
  assert.match(root, /\/opengraph-image\?v=/);
  assert.match(layout, /images: \[\{/);
  assert.match(layout, /\/ekegusii\/opengraph-image/);
  assert.match(layout, /\/ekegusii\/twitter-image/);
  assert.match(layout, /card: "summary_large_image"/);
  assert.match(layout, /20 Ekegusii Bible teaching Pathways/);
  assert.match(layout, /index: false, follow: false/);
  assert.doesNotMatch(layout, /opengraph-image\?v=20260812/);
});

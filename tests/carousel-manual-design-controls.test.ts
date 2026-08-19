import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/carousel-studio/page.tsx", "utf8");
const manual = readFileSync("src/carousel-manual-edit.tsx", "utf8");
const designRoute = readFileSync("app/api/admin/creative-projects/[projectId]/frame-design/route.ts", "utf8");
const artworkRoute = readFileSync("app/api/admin/creative-projects/[projectId]/artwork/route.ts", "utf8");
const roleMigration = readFileSync("supabase/migrations/20260818022000_carousel_artwork_background_role.sql", "utf8");

test("Carousel Studio mounts the full inline per-slide design controls", () => {
  assert.match(page, /<CarouselManualEdit projectId=\{projectId\}\/>/);
  assert.doesNotMatch(page, /CarouselManualDesignControls/);
  assert.match(manual, /Headline size/);
  assert.match(manual, /Body size/);
  assert.match(manual, /Typography \+ color/);
  assert.match(manual, /Headline \+ references/);
  assert.match(manual, /Body \+ support/);
  assert.match(manual, /Background texture/);
  assert.match(manual, /Texture amount/);
  assert.match(manual, /Choose texture with Sol/);
  assert.match(manual, /Use this texture on all slides/);
});

test("manual slide styling persists with the Creative Project instead of local storage", () => {
  assert.match(manual, /\/frame-design/);
  assert.match(manual, /Saved with project/);
  assert.doesNotMatch(manual, /localStorage/);
  assert.match(designRoute, /studio_creative_frame_designs/);
  assert.match(designRoute, /\.upsert\(/);
  assert.match(designRoute, /headlineFont/);
  assert.match(designRoute, /bodyFont/);
  assert.match(designRoute, /headlineColor/);
  assert.match(designRoute, /bodyColor/);
  assert.match(designRoute, /Frame not found in this project/);
});

test("Sol art backgrounds are legal project asset links", () => {
  assert.match(artworkRoute, /role:\s*"background"/);
  assert.match(roleMigration, /'background'/);
  assert.match(roleMigration, /studio_creative_project_assets_role_check/);
});

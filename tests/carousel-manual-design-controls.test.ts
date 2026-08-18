import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/carousel-studio/page.tsx", "utf8");
const controls = readFileSync("src/carousel-manual-design-controls.tsx", "utf8");
const designRoute = readFileSync("app/api/admin/creative-projects/[projectId]/frame-design/route.ts", "utf8");
const artworkRoute = readFileSync("app/api/admin/creative-projects/[projectId]/artwork/route.ts", "utf8");
const roleMigration = readFileSync("supabase/migrations/20260818022000_carousel_artwork_background_role.sql", "utf8");

test("Carousel Studio mounts the restored per-slide design controls", () => {
  assert.match(page, /CarouselManualDesignControls/);
  assert.match(controls, /Headline size/);
  assert.match(controls, /Body size/);
  assert.match(controls, /Main font color/);
  assert.match(controls, /Background texture/);
  assert.match(controls, /Texture amount/);
  assert.match(controls, /Use this texture on all slides/);
});

test("manual slide styling persists with the Creative Project instead of only local storage", () => {
  assert.match(controls, /\/frame-design/);
  assert.match(controls, /saved with project/);
  assert.match(designRoute, /studio_creative_frame_designs/);
  assert.match(designRoute, /\.upsert\(/);
  assert.match(designRoute, /Frame not found in this project/);
});

test("Sol art backgrounds are legal project asset links", () => {
  assert.match(artworkRoute, /role:\s*"background"/);
  assert.match(roleMigration, /'background'/);
  assert.match(roleMigration, /studio_creative_project_assets_role_check/);
});

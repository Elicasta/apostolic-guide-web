import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lane = readFileSync("src/episode-studio-lane.tsx", "utf8");
const nav = readFileSync("src/studio-nav.tsx", "utf8");
const palette = readFileSync("src/studio-command-palette.tsx", "utf8");
const legacy = readFileSync("app/admin/video-producer/episodes/page.tsx", "utf8");

test("Episode Studio is a dedicated top-level Script to Publish lane", () => {
  assert.match(nav, /href: "\/admin\/episode-studio"/);
  assert.match(palette, /label: "Episode Studio"/);
  for (const stage of ["Script", "Audio", "Video", "Publish"]) assert.match(lane, new RegExp(`label: "${stage}"`));
  assert.match(lane, /Generate audio/);
  assert.match(lane, /Create video project/);
  assert.match(lane, /Open in Publishing/);
});

test("legacy Video Producer Episodes route redirects into Episode Studio", () => {
  assert.match(legacy, /redirect\("\/admin\/episode-studio"\)/);
});

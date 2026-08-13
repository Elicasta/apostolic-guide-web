import test from "node:test";
import assert from "node:assert/strict";
import { studioSlug } from "../src/studio/repository";

test("studioSlug normalizes episode titles", () => {
  const slug = studioSlug("  Who Is Jesus Christ?  ");
  assert.match(slug, /^who-is-jesus-christ-[a-z0-9]+$/);
});

test("studioSlug always produces a usable prefix", () => {
  const slug = studioSlug("!!!");
  assert.match(slug, /^episode-[a-z0-9]+$/);
});

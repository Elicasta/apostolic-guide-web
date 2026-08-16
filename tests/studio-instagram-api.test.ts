import assert from "node:assert/strict";
import test from "node:test";
import { instagramGraphBase, instagramGraphVersion } from "../src/instagram-api";

test("Instagram Login publishing stays on graph.instagram.com", () => {
  assert.equal(instagramGraphBase("v24.0"), "https://graph.instagram.com/v24.0");
  assert.equal(instagramGraphBase("v25.0"), "https://graph.instagram.com/v25.0");
  assert.equal(instagramGraphBase("bad-version"), "https://graph.instagram.com/v24.0");
  assert.equal(instagramGraphBase(null), "https://graph.instagram.com/v24.0");
});

test("Graph version normalization accepts only versioned API values", () => {
  assert.equal(instagramGraphVersion("v24.0"), "v24.0");
  assert.equal(instagramGraphVersion(" v24.0 "), "v24.0");
  assert.equal(instagramGraphVersion("24"), "v24.0");
});

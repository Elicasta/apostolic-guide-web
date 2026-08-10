import assert from "node:assert/strict";
import test from "node:test";
import { attributedDestination } from "../src/social-attribution";

const TOKEN = "11111111-1111-4111-8111-111111111111";

test("Apostolic Guide social links receive person attribution and campaign context", () => {
  const result = attributedDestination("https://apostolicguide.com/pathways/jesus-is-god", TOKEN);
  assert.ok(result);
  const url = new URL(result!);
  assert.equal(url.searchParams.get("agp"), TOKEN);
  assert.equal(url.searchParams.get("utm_source"), "instagram");
  assert.equal(url.searchParams.get("utm_medium"), "social_automation");
});

test("existing campaign parameters are preserved", () => {
  const result = attributedDestination("https://apostolicguide.com/articles/test?utm_source=reel&utm_campaign=launch", TOKEN);
  const url = new URL(result!);
  assert.equal(url.searchParams.get("utm_source"), "reel");
  assert.equal(url.searchParams.get("utm_campaign"), "launch");
  assert.equal(url.searchParams.get("agp"), TOKEN);
});

test("external destinations are not decorated with private person tokens", () => {
  const youtube = "https://youtube.com/watch?v=abc";
  assert.equal(attributedDestination(youtube, TOKEN), youtube);
});

test("missing destination stays null and missing token leaves URL unchanged", () => {
  assert.equal(attributedDestination(null, TOKEN), null);
  const url = "https://apostolicguide.com/pathways/test";
  assert.equal(attributedDestination(url, null), url);
});

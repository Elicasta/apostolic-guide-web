import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("drafted lessons cannot appear linguistically approved in the navigation", () => {
  const s = readFileSync("src/ekegusii-edition.tsx","utf8");
  assert.match(s, /eg-ref-pending/);
  assert.match(s, /Bible text checked/);
  assert.match(s, /Teaching explanation still needs review/);
  assert.match(s, /Bible wording not yet compared/);
  assert.doesNotMatch(s, /\{draft\.steps\?\.\[String\(i\)\]\?\.explanation\?\.trim\(\) && <Check/);
});

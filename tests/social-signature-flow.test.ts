import assert from "node:assert/strict";
import test from "node:test";
import { buildStudyHandshake } from "../src/social-signature-flow";

test("study handoffs do not repeat the article in Pathway titles", () => {
  assert.match(buildStudyHandshake("The Father Dwells in the Son"), /I have the Father Dwells in the Son study/);
  assert.doesNotMatch(buildStudyHandshake("The Father Dwells in the Son"), /the The/);
  assert.match(buildStudyHandshake("God Is One"), /I have the God Is One study/);
});

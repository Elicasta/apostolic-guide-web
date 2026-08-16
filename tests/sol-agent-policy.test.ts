import assert from "node:assert/strict";
import test from "node:test";
import { hasExplicitSolIntent } from "../src/sol-agent-policy";

test("mode mutation needs a command instead of a question about the mode", () => {
  assert.equal(hasExplicitSolIntent("switch to trusted mode", "mode"), true);
  assert.equal(hasExplicitSolIntent("turn Sol off", "mode"), true);
  assert.equal(hasExplicitSolIntent("trusted", "mode"), true);
  assert.equal(hasExplicitSolIntent("what does trusted mode do?", "mode"), false);
  assert.equal(hasExplicitSolIntent("what should I work on?", "mode"), false);
});

test("cancel retry and dismiss are separated by explicit user intent", () => {
  assert.equal(hasExplicitSolIntent("cancel that run", "cancel"), true);
  assert.equal(hasExplicitSolIntent("why did that run stop?", "cancel"), false);
  assert.equal(hasExplicitSolIntent("retry the failed video", "retry"), true);
  assert.equal(hasExplicitSolIntent("why did the video fail?", "retry"), false);
  assert.equal(hasExplicitSolIntent("dismiss that proposal", "dismiss"), true);
  assert.equal(hasExplicitSolIntent("explain that proposal", "dismiss"), false);
});

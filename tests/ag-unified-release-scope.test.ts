import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("unified release scope rejects deferred teleprompter paths without relying on a database", () => {
  const output = execFileSync(process.execPath, ["scripts/check-ag-unified-scope.mjs", "--self-test"], { encoding: "utf8" });
  assert.match(output, /Release scope self-test passed \(12 cases\)/);
});

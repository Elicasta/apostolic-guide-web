import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the ledger validation procedure is read-only and the fixture reports an entry problem", () => {
  const script = readFileSync("scripts/validate-pathway-reader-funnel.ts", "utf8");
  const server = readFileSync("src/pathway-reader-funnel-server.ts", "utf8");
  assert.match(script, /method:\s*"GET"/);
  assert.doesNotMatch(script, /\.(insert|update|delete|upsert|rpc)\s*\(/);
  assert.match(server, /PATHWAY_READER_LEDGER\.columns/);
  assert.match(server, /PATHWAY_READER_LEDGER\.eventNames/);

  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/validate-pathway-reader-funnel.ts", "--fixture"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /jesus-is-god · Jesus Is God/);
  assert.match(result.stdout, /opened 10 · began 5 · reading complete 0/);
  assert.match(result.stdout, /diagnosis: Entry problem \(entry, usable\)/);
  assert.doesNotMatch(result.stdout, /fixture-0/);
});

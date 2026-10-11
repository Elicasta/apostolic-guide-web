#!/usr/bin/env node
/**
 * Fail the unified Apostolic Guide release when experimental Teleprompter
 * changes appear in the diff against main. This is a path-based guard only.
 * The existing production teleprompter remains unchanged for this release.
 */
import { execFileSync } from "node:child_process";

function isDeferredTeleprompterPath(value) {
  const path = String(value).replaceAll("\\", "/");
  return /(^|[\\/._-])teleprompter(?=$|[\\/._-])/i.test(path);
}

function selfTest() {
  const blocked = [
    "app/teleprompter/page.tsx",
    "app/api/teleprompter/control/route.ts",
    "app/admin/teleprompter/page.tsx",
    "src/teleprompter-voice-follow.ts",
    "supabase/migrations/20261010041633_teleprompter_staging_sessions.sql",
    "docs/TELEPROMPTER_VOICE_FOLLOW_PREVIEW.md",
    "src\\teleprompter\\follow.ts"
  ];
  const allowed = [
    "app/admin/sol/page.tsx",
    "app/api/admin/grokbot/route.ts",
    "src/studio-nav.tsx",
    "src/pathway-catalog.ts",
    "docs/RELEASE_CANDIDATE_20261011.md"
  ];
  for (const file of blocked) if (!isDeferredTeleprompterPath(file)) throw new Error("Missed blocked file: " + file);
  for (const file of allowed) if (isDeferredTeleprompterPath(file)) throw new Error("False positive: " + file);
  process.stdout.write("Release scope self-test passed (" + (blocked.length + allowed.length) + " cases).\n");
}

if (process.argv[2] === "--self-test") {
  selfTest();
} else {
  const base = process.argv[2], head = process.argv[3];
  if (!base || !head || !/^[a-f0-9]{7,40}$/i.test(base) || !/^[a-f0-9]{7,40}$/i.test(head)) {
    process.stderr.write("Usage: node scripts/check-ag-unified-scope.mjs <base-sha> <head-sha>\n");
    process.exitCode = 2;
  } else {
    try {
      const result = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", base + "..." + head], { encoding: "utf8", maxBuffer: 1024 * 1024 });
      const files = result.split(/\r?\n/).filter(Boolean);
      const blocked = files.filter(isDeferredTeleprompterPath);
      if (blocked.length) {
        process.stderr.write("UNIFIED RELEASE BLOCKED: deferred Teleprompter files changed:\n" + blocked.map(path => "  - " + path).join("\n") + "\n");
        process.exitCode = 1;
      } else {
        process.stdout.write("Unified release excludes experimental Teleprompter paths (" + files.length + " changed files checked).\n");
      }
    } catch (error) {
      process.stderr.write("Release scope check could not inspect the Git diff: " + String(error) + "\n");
      process.exitCode = 2;
    }
  }
}

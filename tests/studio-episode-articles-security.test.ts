import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261021031500_lock_episode_articles_rls.sql",
  "utf8"
);
const route = readFileSync(
  "app/api/admin/episode-studio/[episodeId]/article/route.ts",
  "utf8"
);

test("episode articles migration enables RLS and revokes every direct browser-role privilege", () => {
  assert.match(migration, /alter\s+table\s+public\.studio_episode_articles\s+enable\s+row\s+level\s+security\s*;/i);
  assert.match(
    migration,
    /revoke\s+all\s+privileges\s+on\s+table\s+public\.studio_episode_articles\s+from\s+anon\s*,\s*authenticated\s*;/i
  );
  assert.doesNotMatch(migration, /create\s+policy|grant\s+.+\s+to\s+(?:anon|authenticated)/i);
});

test("episode article endpoints require Studio content permission and server-side credentials", () => {
  for (const method of ["GET", "POST", "PATCH"]) {
    assert.match(route, new RegExp(`export async function ${method}\\(`));
  }
  assert.equal(
    [...route.matchAll(/getStudioPermission\("manage_content"\)/g)].length,
    3,
    "all three article methods must check the manage_content role"
  );
  assert.equal(
    [...route.matchAll(/createServiceClient\(\)/g)].length,
    3,
    "all three article methods must use the server-only service client"
  );
  assert.doesNotMatch(route, /createBrowserClient|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/i);
});

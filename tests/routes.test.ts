import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const publicRouteFiles = [
  "app/page.tsx",
  "app/topics/page.tsx",
  "app/topics/[slug]/page.tsx",
  "app/scripture/[[...path]]/page.tsx",
  "app/pathways/page.tsx",
  "app/pathways/[slug]/page.tsx",
  "app/media/page.tsx",
  "app/login/page.tsx"
];

test("public navigation routes have page implementations", () => {
  publicRouteFiles.forEach((routeFile) => {
    assert.ok(existsSync(join(process.cwd(), routeFile)), `${routeFile} is missing`);
  });
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const publicRouteFiles = [
  "app/page.tsx",
  "app/about/page.tsx",
  "app/answers/page.tsx",
  "app/answers/[slug]/page.tsx",
  "app/app/page.tsx",
  "app/articles/page.tsx",
  "app/articles/[slug]/page.tsx",
  "app/beliefs/page.tsx",
  "app/contact/page.tsx",
  "app/how-it-works/page.tsx",
  "app/links/page.tsx",
  "app/media/page.tsx",
  "app/pathways/page.tsx",
  "app/pathways/[slug]/page.tsx",
  "app/privacy/page.tsx",
  "app/scripture/[[...path]]/page.tsx",
  "app/search/page.tsx",
  "app/subscribe/page.tsx",
  "app/terms/page.tsx",
  "app/topics/page.tsx",
  "app/topics/[slug]/page.tsx"
];

const authAndAdminRouteFiles = [
  "app/admin/page.tsx",
  "app/admin/layout.tsx",
  "app/admin/growth/page.tsx",
  "app/admin/people/page.tsx",
  "app/admin/people/[id]/page.tsx",
  "app/api/admin/people/[id]/route.ts",
  "app/admin/segments/page.tsx",
  "app/admin/inbox/page.tsx",
  "app/admin/journeys/page.tsx",
  "app/admin/journeys/[id]/page.tsx",
  "app/api/admin/journeys/route.ts",
  "app/admin/social/page.tsx",
  "app/admin/broadcasts/page.tsx",
  "app/login/page.tsx",
  "app/forgot-password/page.tsx",
  "app/update-password/page.tsx",
  "app/auth/callback/route.ts"
];

const publicApiRoutes = [
  "app/api/analytics/events/route.ts",
  "app/api/health/route.ts",
  "app/api/subscribe/route.ts",
  "app/api/webhooks/meta/instagram/route.ts"
];

test("public navigation routes have page implementations", () => {
  publicRouteFiles.forEach((routeFile) => assert.ok(existsSync(join(process.cwd(), routeFile)), `${routeFile} is missing`));
});

test("auth and admin navigation routes have implementations", () => {
  authAndAdminRouteFiles.forEach((routeFile) => assert.ok(existsSync(join(process.cwd(), routeFile)), `${routeFile} is missing`));
});

test("public API routes have implementations", () => {
  publicApiRoutes.forEach((routeFile) => assert.ok(existsSync(join(process.cwd(), routeFile)), `${routeFile} is missing`));
});

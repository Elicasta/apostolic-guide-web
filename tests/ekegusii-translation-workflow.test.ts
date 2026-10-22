
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Ekegusii AI draft cannot publish itself or accept uncontrolled prompts", () => {
 const route = readFileSync("app/api/ekegusii/draft/route.ts", "utf8");
 assert.match(route, /pathwayBySlug\(slug\)/);
 assert.match(route, /unstable_cache/);
 assert.match(route, /approved: false/);
 assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(route, /language: "guz"/);
});
test("Reviewer can submit a passage correction to the existing inbox without a new database write path", () => {
 const reader = readFileSync("src/ekegusii-edition.tsx", "utf8");
 assert.match(reader, /"\/api\/contact"/);
 assert.match(reader, /"Content or source correction"/);
 assert.match(reader, /DO NOT AUTO-PUBLISH/);
 assert.match(reader, /submitState === "sending"/);
});
test("Bible resource links to a rights-controlled Bible reader and distributor, without copying the text", () => {
 const bible = readFileSync("app/ekegusii/bible/page.tsx", "utf8");
 assert.match(bible, /ebible\.org\/study/);
 assert.match(bible, /ebible\.org\/details\.php\?id=guz/);
 assert.match(bible, /All rights reserved/);
});

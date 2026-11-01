
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Ekegusii AI draft cannot publish itself or accept uncontrolled prompts", () => {
 const route = readFileSync("app/api/ekegusii/draft/route.ts", "utf8");
 assert.match(route, /pathwayBySlug\(slug\)/);
 assert.match(route, /bibleSourcedEkegusiiSeed\(slug\)/);
 assert.doesNotMatch(route, /OPENAI_API_KEY|api.openai.com/);
 assert.match(route, /approved: false/);
 assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(route, /language: "guz"/);
});
test("Reviewer submits structured Ekegusii correction without publishing", () => {
 const reader = readFileSync("src/ekegusii-edition.tsx", "utf8");
 const route = readFileSync("app/api/ekegusii/corrections/route.ts", "utf8");
 assert.match(reader, /"\/api\/ekegusii\/corrections"/);
 assert.match(route, /ekegusii_corrections/);
 assert.match(route, /recordWebsiteContactSubmission/);
 assert.match(reader, /submitState === "sending"/);
 assert.doesNotMatch(route, /ekegusii_published_steps/);
});
test("Bible resource links to a rights-controlled Bible reader and distributor, without copying the text", () => {
 const bible = readFileSync("app/ekegusii/bible/page.tsx", "utf8");
 assert.match(bible, /ebible\.org\/study/);
 assert.match(bible, /ebible\.org\/details\.php\?id=guz/);
 assert.match(bible, /All rights reserved/);
});

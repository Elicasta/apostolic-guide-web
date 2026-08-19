import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("priority search answers receive deeper ranking sections", () => {
  const ranking = source("src/seo-ranking-content.ts");
  const prioritySlugs = [
    "is-jesus-god",
    "is-jesus-the-father",
    "why-did-jesus-pray",
    "does-matthew-28-19-contradict-acts-2-38",
    "why-baptize-in-jesus-name",
    "what-does-right-hand-of-god-mean"
  ];

  prioritySlugs.forEach((slug) => assert.match(ranking, new RegExp(`"${slug}"\\s*:`), slug));
  assert.match(ranking, /Does the Bible actually call Jesus God\?/);
  assert.match(ranking, /What does Colossians 2:9 mean\?/);
  assert.match(ranking, /Luke 24:47 is the bridge between the Great Commission and Acts 2:38/);
  assert.match(ranking, /The Old Testament defines God's right hand as power and victory/);
});

test("topic metadata uses search-language title overrides without changing canonical slugs", () => {
  const ranking = source("src/seo-ranking-content.ts");
  const topicPage = source("app/topics/[slug]/page.tsx");

  assert.match(ranking, /Jesus Is God: Bible Verses and Explanation/);
  assert.match(ranking, /Right Hand of God: Meaning and Bible Verses/);
  assert.match(ranking, /The Name of Jesus: Baptism and Salvation Bible Study/);
  assert.match(topicPage, /seoTitleForTopic\(slug, topic\.title\)/);
  assert.match(topicPage, /path: `\/topics\/\$\{slug\}`/);
});

test("search intent clusters cover the main doctrinal acquisition themes", () => {
  const clusters = source("src/search-intent-cluster.tsx");

  [
    "Questions about the deity of Jesus",
    "Questions about the Son and Jesus' prayers",
    "Questions about baptism in Jesus' name",
    "Questions about the right hand of God",
    "Questions about the one God"
  ].forEach((heading) => assert.ok(clusters.includes(heading), heading));

  [
    "/answers/is-jesus-god",
    "/answers/why-did-jesus-pray",
    "/answers/does-matthew-28-19-contradict-acts-2-38",
    "/answers/why-baptize-in-jesus-name",
    "/answers/what-does-right-hand-of-god-mean",
    "/pathways/jesus-is-god",
    "/pathways/baptism-in-jesus-name",
    "/scripture/colossians/2/9",
    "/scripture/acts/2/38"
  ].forEach((href) => assert.ok(clusters.includes(href), href));
});

test("core study page types render server-visible search intent clusters", () => {
  const files = [
    "app/answers/[slug]/page.tsx",
    "app/topics/[slug]/page.tsx",
    "app/pathways/[slug]/page.tsx",
    "app/scripture/[[...path]]/page.tsx",
    "app/articles/[slug]/page.tsx"
  ];

  files.forEach((file) => {
    const page = source(file);
    assert.match(page, /SearchIntentCluster/, file);
    assert.match(page, /currentPath/, file);
  });
});

test("answer pages merge ranking sections into the visible content body", () => {
  const answerPage = source("app/answers/[slug]/page.tsx");
  assert.match(answerPage, /seoSectionsForAnswer\(resolvedAnswer\.slug\)/);
  assert.match(answerPage, /sections=\{\[\.\.\.resolvedAnswer\.sections, \.\.\.rankingSections\]\}/);
});

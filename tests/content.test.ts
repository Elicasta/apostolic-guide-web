import assert from "node:assert/strict";
import test from "node:test";
import {
  answers,
  articles,
  pathways,
  scriptures,
  searchContent,
  topics
} from "../src/data";

test("launch inventory is not empty", () => {
  assert.ok(topics.length >= 8);
  assert.ok(answers.length >= 12);
  assert.ok(articles.length >= 6);
  assert.ok(scriptures.length >= 15);
  assert.ok(pathways.length >= 3);
});

test("all public slugs are unique inside their content type", () => {
  for (const collection of [topics, answers, articles, pathways]) {
    const slugs = collection.map((item) => item.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  }
});

test("scripture paths are unique and normalized", () => {
  const paths = scriptures.map((item) => item.path);
  assert.equal(new Set(paths).size, paths.length);
  paths.forEach((path) => assert.match(path, /^[a-z0-9-]+\/\d+\/[0-9-]+$/));
});

test("content relationships resolve", () => {
  const topicSlugs = new Set(topics.map((item) => item.slug));
  answers.forEach((answer) => assert.ok(topicSlugs.has(answer.topicSlug), answer.slug));
  articles.forEach((article) => assert.ok(topicSlugs.has(article.topicSlug), article.slug));
  pathways.forEach((pathway) => assert.ok(topicSlugs.has(pathway.topicSlug), pathway.slug));
  scriptures.forEach((entry) => entry.topicSlugs.forEach((slug) => assert.ok(topicSlugs.has(slug), `${entry.slug}:${slug}`)));
});

test("exact questions and scripture references rank useful results", () => {
  assert.equal(searchContent("Why did Jesus pray?")[0]?.title, "Why did Jesus pray if he is God?");
  assert.equal(searchContent("John 14:9")[0]?.title, "John 14:9–11");
  assert.ok(searchContent("baptism in Jesus name").some((result) => result.href.includes("name")));
});

test("website pathways map to valid app pathway slugs", () => {
  const expected = new Set(["jesus-is-god", "father-dwells-in-son", "baptism-in-jesus-name"]);
  pathways.forEach((pathway) => assert.ok(expected.has(pathway.appSlug), pathway.appSlug));
});

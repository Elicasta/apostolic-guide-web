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
import { allPathways } from "../src/pathway-catalog";
import { bibleGatewayUrl, youVersionUrl } from "../src/bible-links";
import {
  answerSuggestions,
  articleSuggestions,
  pathwaySuggestions,
  scriptureSuggestions,
  topicSuggestions
} from "../src/suggestion-data";

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

  const pathwaySlugs = allPathways.map((item) => item.slug);
  assert.equal(new Set(pathwaySlugs).size, pathwaySlugs.length);
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
  allPathways.forEach((pathway) => assert.ok(topicSlugs.has(pathway.topicSlug), `${pathway.slug}:${pathway.topicSlug}`));
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
  allPathways.forEach((pathway) => assert.ok(pathway.appSlug.trim().length > 0, pathway.slug));
});

test("every curated Scripture generates working external Bible destinations", () => {
  scriptures.forEach((entry) => {
    const youVersion = youVersionUrl(entry.reference);
    const gateway = bibleGatewayUrl(entry.reference);

    assert.ok(youVersion, `YouVersion URL missing for ${entry.reference}`);
    assert.match(youVersion, /^https:\/\/bible\.com\/bible\/1\/[1-3A-Z]+\.\d+\.\d+(?:-\d+)?\.KJV$/);
    assert.match(gateway, /^https:\/\/www\.biblegateway\.com\/passage\/\?search=.+&version=KJV$/);
  });
});

test("every pathway step generates a YouVersion and Bible Gateway link", () => {
  allPathways.forEach((pathway) => {
    pathway.steps.forEach((step) => {
      assert.ok(youVersionUrl(step.reference), `${pathway.slug}: ${step.reference}`);
      assert.ok(bibleGatewayUrl(step.reference), `${pathway.slug}: ${step.reference}`);
    });
  });
});

function assertInternalHrefResolves(href: string) {
  const cleanHref = href.split("?")[0].split("#")[0];
  if (cleanHref === "" || cleanHref === "/") return;

  const [section, ...rest] = cleanHref.replace(/^\//, "").split("/");
  const tail = rest.join("/");

  if (section === "topics") {
    assert.ok(topics.some((item) => item.slug === tail), href);
    return;
  }
  if (section === "answers") {
    assert.ok(answers.some((item) => item.slug === tail), href);
    return;
  }
  if (section === "articles") {
    assert.ok(articles.some((item) => item.slug === tail), href);
    return;
  }
  if (section === "pathways") {
    assert.ok(allPathways.some((item) => item.slug === tail), href);
    return;
  }
  if (section === "scripture") {
    assert.ok(scriptures.some((item) => item.path === tail), href);
    return;
  }

  assert.fail(`Unexpected generated internal href: ${href}`);
}

test("every smart recommendation points to an existing content route", () => {
  articles.forEach((article) => articleSuggestions(article.slug).forEach((item) => assertInternalHrefResolves(item.href)));
  answers.forEach((answer) => answerSuggestions(answer.slug).forEach((item) => assertInternalHrefResolves(item.href)));
  topics.forEach((topic) => topicSuggestions(topic.slug).forEach((item) => assertInternalHrefResolves(item.href)));
  allPathways.forEach((pathway) => pathwaySuggestions(pathway.slug).forEach((item) => assertInternalHrefResolves(item.href)));
  scriptures.forEach((entry) => scriptureSuggestions(entry.path).forEach((item) => assertInternalHrefResolves(item.href)));
});

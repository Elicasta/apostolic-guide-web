import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("SEO V2 uses www as the single canonical website host", () => {
  const urls = source("src/urls.ts");
  const layout = source("app/layout.tsx");
  const sitemap = source("app/sitemap.ts");
  const robots = source("app/robots.ts");
  assert.match(urls, /canonicalWebsiteUrl = "https:\/\/www\.apostolicguide\.com"/);
  assert.match(layout, /metadataBase: new URL\(canonicalWebsiteUrl\)/);
  assert.match(layout, /url: canonicalWebsiteUrl/);
  assert.match(sitemap, /canonicalWebsiteUrl/);
  assert.match(robots, /sitemap: `\$\{canonicalWebsiteUrl\}\/sitemap\.xml`/);
});

test("SEO V2 sitemap submits the live 20-Pathway catalog instead of the retired pathway collection", () => {
  const sitemap = source("app/sitemap.ts");
  assert.match(sitemap, /import \{ allPathways \} from "@\/pathway-catalog"/);
  assert.match(sitemap, /\.\.\.allPathways\.map/);
  assert.doesNotMatch(sitemap, /import \{[^}]*\bpathways\b[^}]*\} from "@\/data"/);
});

test("SEO V2 centralizes self-canonical, OpenGraph, Twitter, and breadcrumb metadata", () => {
  const seo = source("src/seo.ts");
  assert.match(seo, /alternates: \{ canonical: canonicalPath \}/);
  assert.match(seo, /url: absoluteWebsiteUrl\(canonicalPath\)/);
  assert.match(seo, /card: "summary_large_image"/);
  assert.match(seo, /"@type": "BreadcrumbList"/);
});

test("Answer, Topic, Pathway, Article, and Scripture pages emit self canonicals and breadcrumbs", () => {
  const files = [
    "app/answers/[slug]/page.tsx",
    "app/topics/[slug]/page.tsx",
    "app/pathways/[slug]/page.tsx",
    "app/articles/[slug]/page.tsx",
    "app/scripture/[[...path]]/page.tsx"
  ];
  for (const file of files) {
    const page = source(file);
    assert.match(page, /buildSeoMetadata/);
    assert.match(page, /breadcrumbJsonLd/);
  }
});

test("Scripture landing pages target passage meaning and context without changing page content", () => {
  const page = source("app/scripture/[[...path]]/page.tsx");
  assert.match(page, /title: `\$\{entry\.reference\} Meaning and Context`/);
  assert.match(page, /path: `\/scripture\/\$\{entry\.path\}`/);
});

test("SEO V2 keeps search and app handoff utility pages out of the index", () => {
  const search = source("app/search/page.tsx");
  const install = source("app/install-app/page.tsx");
  assert.match(search, /robots: \{ index: false, follow: true \}/);
  assert.match(install, /robots: \{ index: false, follow: true \}/);
});

test("SEO V2 upgrades the four main discovery index pages with canonical metadata", () => {
  for (const file of ["app/answers/page.tsx", "app/topics/page.tsx", "app/pathways/page.tsx", "app/articles/page.tsx"]) {
    const page = source(file);
    assert.match(page, /buildSeoMetadata/);
    assert.match(page, /path: "\/(answers|topics|pathways|articles)"/);
  }
});

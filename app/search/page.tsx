import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, FileText, HelpCircle, Route } from "lucide-react";
import { PageHero, SearchForm } from "@/components";
import { searchContent } from "@/data";
import { allPathways } from "@/pathway-catalog";
import { listDatabaseContent } from "@/database-content";
import { SearchAnalytics } from "@/search-analytics";

export const metadata: Metadata = {
  title: "Search Scripture and Apostolic Doctrine",
  description: "Search Apostolic Guide by question, doctrine, Scripture reference, objection, or phrase.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/search" }
};

type Props = { searchParams: Promise<{ q?: string }> };

type SearchResult = {
  type: string;
  title: string;
  summary: string;
  href: string;
  score: number;
};

const icons = { Topic: BookOpen, Answer: HelpCircle, Article: FileText, Scripture: BookOpen, Pathway: Route };
const searchPrompts = [
  "Why did Jesus pray?",
  "John 14:9",
  "Right hand of God",
  "Baptism in Jesus' name"
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const localResults: SearchResult[] = query
    ? searchContent(query).map((item) => ({
        type: item.kind,
        title: item.title,
        summary: item.summary,
        href: item.href,
        score: item.score
      }))
    : [];
  const terms = normalize(query).split(" ").filter(Boolean);
  const pathwayResults: SearchResult[] = query
    ? allPathways.map((item) => {
        const title = normalize(item.title);
        const summary = normalize(item.summary);
        const references = normalize(item.steps.map((step) => step.reference).join(" "));
        const score = terms.reduce((total, term) => total + (title.includes(term) ? 6 : 0) + (summary.includes(term) ? 3 : 0) + (references.includes(term) ? 2 : 0), 0);
        return score > 0 ? { type: "Pathway", title: item.title, summary: item.summary, href: `/pathways/${item.slug}`, score } : null;
      }).filter((item): item is SearchResult => Boolean(item))
    : [];
  const databaseItems = query ? await listDatabaseContent() : [];
  const databaseResults: SearchResult[] = databaseItems
    .map((item) => {
      const title = normalize(item.title);
      const summary = normalize(item.summary);
      const score = terms.reduce((total, term) => total + (title.includes(term) ? 5 : 0) + (summary.includes(term) ? 2 : 0), 0);
      const section = item.kind === "article" ? "articles" : item.kind === "answer" ? "answers" : item.kind === "topic" ? "topics" : null;
      return section && score > 0 ? {
        type: item.kind === "article" ? "Article" : item.kind === "answer" ? "Answer" : "Topic",
        title: item.title,
        summary: item.summary,
        href: `/${section}/${item.slug}`,
        score
      } : null;
    })
    .filter((item): item is SearchResult => Boolean(item));

  const seen = new Set<string>();
  const results = [...databaseResults, ...pathwayResults, ...localResults]
    .sort((a, b) => b.score - a.score)
    .filter((result) => {
      if (seen.has(result.href)) return false;
      seen.add(result.href);
      return true;
    });

  return (
    <>
      <PageHero
        eyebrow="Search Scripture and doctrine"
        title="Find the question, passage, or doctrine."
        text={"Use the words you would actually use. Search connects common phrasing to Scripture, topics, answers, and guided studies."}
      />
      <section className="section section-tight">
        <div className="shell search-page">
          <SearchForm defaultValue={q} />
          {query && <SearchAnalytics query={query} resultCount={results.length} />}
          {query && <div className="search-result-summary" data-search-result-count={results.length}><strong>{results.length}</strong> result{results.length === 1 ? "" : "s"} for “{q}”</div>}
          {!query && (
            <section className="search-prompt-panel" aria-labelledby="search-prompt-title">
              <span className="eyebrow">Popular starting points</span>
              <h2 id="search-prompt-title">Choose a question and open the results.</h2>
              <div className="search-prompt-grid">
                {searchPrompts.map((prompt) => (
                  <Link className="search-prompt-link" href={`/search?q=${encodeURIComponent(prompt)}`} key={prompt}>
                    {prompt}<ArrowRight size={16} />
                  </Link>
                ))}
              </div>
            </section>
          )}
          {query && !results.length && <div className="empty-state"><h2>No useful result yet.</h2><p>This search has been recorded as a content gap. Try a shorter phrase or a Scripture reference.</p></div>}
          <div className="search-results">
            {results.map((result) => {
              const Icon = icons[result.type as keyof typeof icons] ?? FileText;
              return (
                <Link className="search-result" href={result.href} key={`${result.type}-${result.href}`}>
                  <Icon size={20} />
                  <div><span className="eyebrow">{result.type}</span><h2>{result.title}</h2><p>{result.summary}</p></div>
                  <ArrowRight size={18} />
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

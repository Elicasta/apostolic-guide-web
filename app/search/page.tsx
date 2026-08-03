import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, FileText, HelpCircle, Route } from "lucide-react";
import { PageHero, SearchForm } from "@/components";
import { searchContent } from "@/data";
import { listDatabaseContent } from "@/database-content";
import { SearchAnalytics } from "@/search-analytics";

export const metadata: Metadata = {
  title: "Search",
  description: "Search Apostolic Guide by question, doctrine, Scripture, objection, or phrase."
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
  const databaseItems = query ? await listDatabaseContent() : [];
  const terms = normalize(query).split(" ").filter(Boolean);
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
  const results = [...databaseResults, ...localResults]
    .sort((a, b) => b.score - a.score)
    .filter((result) => {
      if (seen.has(result.href)) return false;
      seen.add(result.href);
      return true;
    });

  return (
    <>
      <PageHero
        eyebrow="Search the library"
        title="Find the question, passage, or doctrine."
        text="Use the words you would actually use. Search results connect common phrasing to Apostolic Guide's structured library."
      />
      <section className="section section-tight">
        <div className="shell search-page">
          <SearchForm defaultValue={q} />
          {query && <SearchAnalytics query={query} resultCount={results.length} />}
          {query && <div className="search-result-summary" data-search-result-count={results.length}><strong>{results.length}</strong> result{results.length === 1 ? "" : "s"} for “{q}”</div>}
          {!query && <div className="empty-state"><h2>Start with a real question.</h2><p>Try “Why did Jesus pray?”, “John 14:9”, “right hand,” or “baptism in Jesus' name.”</p></div>}
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

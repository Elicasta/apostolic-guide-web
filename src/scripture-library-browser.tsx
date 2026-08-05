"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, ChevronDown, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ScriptureEntry } from "@/data";

type DoctrineFilter = "all" | "one-god" | "jesus-christ" | "salvation" | "interpretation";
type TestamentFilter = "all" | "old" | "new";

const doctrineFilters: Array<{
  id: DoctrineFilter;
  label: string;
  matches: (entry: ScriptureEntry) => boolean;
}> = [
  { id: "all", label: "All Scripture", matches: () => true },
  { id: "one-god", label: "God Is One", matches: (entry) => entry.topicSlugs.includes("god-is-one") },
  {
    id: "jesus-christ",
    label: "Jesus Christ",
    matches: (entry) => entry.topicSlugs.some((slug) => [
      "jesus-is-god",
      "the-father-in-the-son",
      "the-word-became-flesh",
      "the-son-of-god"
    ].includes(slug))
  },
  {
    id: "salvation",
    label: "Salvation",
    matches: (entry) => entry.topicSlugs.some((slug) => ["the-name-of-jesus", "the-new-birth"].includes(slug))
  },
  { id: "interpretation", label: "Interpretation", matches: (entry) => entry.topicSlugs.includes("right-hand-of-god") }
];

const bookOrder = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah",
  "Esther", "Job", "Psalm", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
  "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
];

const oldTestamentBooks = new Set(bookOrder.slice(0, bookOrder.indexOf("Matthew")));

function getBook(reference: string) {
  return reference.match(/^((?:[1-3]\s)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+\d/)?.[1] ?? "Other";
}

function getTestament(entry: ScriptureEntry): Exclude<TestamentFilter, "all"> {
  return oldTestamentBooks.has(getBook(entry.reference)) ? "old" : "new";
}

function sortBooks(a: string, b: string) {
  const aIndex = bookOrder.indexOf(a);
  const bIndex = bookOrder.indexOf(b);
  if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
}

export function ScriptureLibraryBrowser({ entries }: { entries: ScriptureEntry[] }) {
  const [doctrine, setDoctrine] = useState<DoctrineFilter>("all");
  const [testament, setTestament] = useState<TestamentFilter>("all");
  const [book, setBook] = useState("all");

  const doctrineDefinition = doctrineFilters.find((filter) => filter.id === doctrine) ?? doctrineFilters[0];

  const doctrineEntries = useMemo(
    () => entries.filter((entry) => doctrineDefinition.matches(entry)),
    [doctrineDefinition, entries]
  );

  const testamentEntries = useMemo(
    () => doctrineEntries.filter((entry) => testament === "all" || getTestament(entry) === testament),
    [doctrineEntries, testament]
  );

  const availableBooks = useMemo(
    () => Array.from(new Set(testamentEntries.map((entry) => getBook(entry.reference)))).sort(sortBooks),
    [testamentEntries]
  );

  useEffect(() => {
    if (book !== "all" && !availableBooks.includes(book)) setBook("all");
  }, [availableBooks, book]);

  const visibleEntries = useMemo(
    () => testamentEntries.filter((entry) => book === "all" || getBook(entry.reference) === book),
    [book, testamentEntries]
  );

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, ScriptureEntry[]>();
    visibleEntries.forEach((entry) => {
      const bookName = getBook(entry.reference);
      groups.set(bookName, [...(groups.get(bookName) ?? []), entry]);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => sortBooks(a, b))
      .map(([bookName, bookEntries]) => ({ bookName, entries: bookEntries }));
  }, [visibleEntries]);

  const hasFilters = doctrine !== "all" || testament !== "all" || book !== "all";
  const filterKey = `${doctrine}-${testament}-${book}`;

  function resetFilters() {
    setDoctrine("all");
    setTestament("all");
    setBook("all");
  }

  return (
    <div className="scripture-browser">
      <div className="scripture-filter-panel" aria-label="Filter the Scripture library">
        <div className="scripture-filter-heading">
          <div>
            <span>Organize the library</span>
            <strong>{visibleEntries.length} passages across {groupedEntries.length} {groupedEntries.length === 1 ? "book" : "books"}</strong>
          </div>
          {hasFilters && (
            <button type="button" onClick={resetFilters} className="scripture-filter-reset">
              <RotateCcw size={14} /> Reset
            </button>
          )}
        </div>

        <div className="scripture-filter-section">
          <span className="scripture-filter-label">Doctrine</span>
          <div className="scripture-filter-options" role="group" aria-label="Filter by doctrine">
            {doctrineFilters.map((filter) => {
              const count = entries.filter((entry) => filter.matches(entry)).length;
              return (
                <button
                  type="button"
                  key={filter.id}
                  className="scripture-filter-button"
                  aria-pressed={doctrine === filter.id}
                  onClick={() => setDoctrine(filter.id)}
                >
                  {filter.label}<small>{count}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="scripture-filter-lower">
          <div className="scripture-filter-section">
            <span className="scripture-filter-label">Testament</span>
            <div className="scripture-testament-options" role="group" aria-label="Filter by testament">
              {(["all", "old", "new"] as TestamentFilter[]).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={testament === value}
                  onClick={() => setTestament(value)}
                >
                  {value === "all" ? "Both" : value === "old" ? "Old Testament" : "New Testament"}
                </button>
              ))}
            </div>
          </div>

          <label className="scripture-book-filter">
            <span className="scripture-filter-label">Book</span>
            <select value={book} onChange={(event) => setBook(event.target.value)}>
              <option value="all">All available books</option>
              {availableBooks.map((bookName) => <option value={bookName} key={bookName}>{bookName}</option>)}
            </select>
          </label>
        </div>
      </div>

      {groupedEntries.length > 0 ? (
        <div className="scripture-book-groups" key={filterKey}>
          {groupedEntries.map((group, index) => (
            <details className="scripture-book-group" key={group.bookName} open={index === 0}>
              <summary>
                <span>
                  <small>{getTestament(group.entries[0]) === "old" ? "Old Testament" : "New Testament"}</small>
                  <strong>{group.bookName}</strong>
                </span>
                <span className="scripture-book-count">{group.entries.length} {group.entries.length === 1 ? "passage" : "passages"}</span>
                <ChevronDown size={18} aria-hidden />
              </summary>
              <div className="scripture-book-grid">
                {group.entries.map((entry) => (
                  <Link className="scripture-mini" href={`/scripture/${entry.path}`} key={entry.slug}>
                    <BookOpen size={19} aria-hidden />
                    <span><strong>{entry.reference}</strong><small>{entry.mainPoint}</small></span>
                    <ArrowRight size={17} aria-hidden />
                  </Link>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="scripture-filter-empty">
          <strong>No passages match these filters yet.</strong>
          <p>Reset the filters or choose another doctrine, testament, or book.</p>
          <button type="button" onClick={resetFilters}>Show the full library</button>
        </div>
      )}
    </div>
  );
}

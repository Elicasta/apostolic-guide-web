import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

type ArticlePosterProps = {
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  readingMinutes?: number;
  index?: number;
};

function displayTitle(title: string) {
  if (title !== title.toUpperCase()) return title;
  const smallWords = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to"]);
  return title
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (index > 0 && smallWords.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function ArticlePoster({
  slug,
  title,
  eyebrow,
  summary,
  readingMinutes,
  index = 0
}: ArticlePosterProps) {
  const variant = index % 4;
  const issue = String(index + 1).padStart(2, "0");

  return (
    <Link className={`ei-article-poster ei-poster-${variant}`} href={`/articles/${slug}`} data-reveal>
      <header>
        <span>{eyebrow}</span>
        <span>Study / {issue}</span>
      </header>
      <div className="ei-poster-graphic ag-poster-graphic" aria-hidden="true">
        <span className="ag-poster-rule" />
        <span className="ei-poster-index">{issue}</span>
      </div>
      <div className="ei-poster-copy">
        <h3>{displayTitle(title)}</h3>
        <p>{summary}</p>
      </div>
      <footer>
        <span>{readingMinutes ? `${readingMinutes} min study` : "Published study"}</span>
        <ArrowUpRight size={18} />
      </footer>
    </Link>
  );
}

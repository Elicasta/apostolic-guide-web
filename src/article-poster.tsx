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
        <span>AG / {issue}</span>
      </header>
      <div className="ei-poster-graphic" aria-hidden="true">
        <span className="ei-orbit ei-orbit-a" />
        <span className="ei-orbit ei-orbit-b" />
        <span className="ei-orbit ei-orbit-c" />
        <span className="ei-poster-index">{issue}</span>
      </div>
      <div className="ei-poster-copy">
        <h3>{title}</h3>
        <p>{summary}</p>
      </div>
      <footer>
        <span>{readingMinutes ? `${readingMinutes} min study` : "Published study"}</span>
        <ArrowUpRight size={18} />
      </footer>
    </Link>
  );
}

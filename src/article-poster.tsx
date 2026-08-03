import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandCrown } from "./brand-marks";

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
      <div className="ei-poster-graphic ag-poster-graphic" aria-hidden="true">
        <BrandCrown className="ag-poster-crown" />
        <span className="ag-poster-slash" />
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

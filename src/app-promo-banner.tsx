import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buildAppUrl } from "./urls";

const items = [
  "TRY THE APP",
  "INSTALL ON YOUR HOME SCREEN",
  "SEARCH SCRIPTURE FASTER",
  "FOLLOW GUIDED PATHWAYS",
  "SAVE YOUR STUDIES"
];

export function AppPromoBanner() {
  const destination = buildAppUrl("/", { placement: "homepage-banner" });
  const repeated = [...items, ...items];

  return (
    <Link className="app-promo-ticker" href={destination} aria-label="Try the Apostolic Guide app">
      <span className="sr-only">Try the Apostolic Guide app</span>
      <span className="app-promo-track" aria-hidden="true">
        {repeated.map((item, index) => (
          <span key={`${item}-${index}`}>
            <b>{item}</b>
            <strong>·</strong>
          </span>
        ))}
        <span><b>OPEN APP</b><ArrowUpRight size={18} /></span>
      </span>
    </Link>
  );
}

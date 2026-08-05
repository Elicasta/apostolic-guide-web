"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Grid2X2, List } from "lucide-react";

type LibraryView = "cards" | "list";

export function ArticleLibraryView({ children }: { children: ReactNode }) {
  const [view, setView] = useState<LibraryView>("cards");

  useEffect(() => {
    const saved = window.localStorage.getItem("ag-article-library-view");
    if (saved === "cards" || saved === "list") setView(saved);
  }, []);

  function chooseView(next: LibraryView) {
    setView(next);
    window.localStorage.setItem("ag-article-library-view", next);
  }

  return (
    <div className={`article-library-view article-library-view-${view}`}>
      <div className="shell article-library-toolbar" aria-label="Article layout">
        <span>View</span>
        <div className="article-view-toggle" role="group" aria-label="Choose article layout">
          <button type="button" aria-pressed={view === "cards"} onClick={() => chooseView("cards")}>
            <Grid2X2 size={16} /> Cards
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => chooseView("list")}>
            <List size={17} /> List
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

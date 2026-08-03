"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "./analytics";

export function SearchAnalytics({ query, resultCount }: { query: string; resultCount: number }) {
  const sent = useRef(false);

  useEffect(() => {
    if (!query || sent.current) return;
    sent.current = true;
    trackEvent("search_submitted", { query, resultCount });
    if (resultCount === 0) trackEvent("search_no_results", { query });
  }, [query, resultCount]);

  return null;
}

"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("route error", error); }, [error]);
  return (
    <section className="section">
      <div className="shell empty-state">
        <span className="eyebrow">Something failed</span>
        <h1>The library could not load this page.</h1>
        <p>The failure has been contained. Try the request again without losing the rest of the site.</p>
        <button className="button button-crimson" onClick={reset}>Try again</button>
      </div>
    </section>
  );
}

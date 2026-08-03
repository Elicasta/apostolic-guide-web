"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { trackEvent } from "./analytics";

export function ShareButton({ title, contentKey }: { title: string; contentKey: string }) {
  const [label, setLabel] = useState("Share");

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setLabel("Link copied");
        window.setTimeout(() => setLabel("Share"), 1800);
      }
      trackEvent("content_shared", { contentKey, title });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLabel("Copy failed");
      window.setTimeout(() => setLabel("Share"), 1800);
    }
  }

  return <button className="share-button" type="button" onClick={share}><Share2 size={15} /> {label}</button>;
}

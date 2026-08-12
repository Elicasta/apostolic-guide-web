"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function PathwayAudioMetricsRefresh() {
  const router = useRouter();

  useEffect(() => {
    let lastRefresh = 0;

    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (document.querySelector(".pathway-audio-textarea")) return;
      const now = Date.now();
      if (now - lastRefresh < 1500) return;
      lastRefresh = now;
      router.refresh();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}

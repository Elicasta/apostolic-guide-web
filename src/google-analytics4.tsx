"use client";

import { useEffect } from "react";

// An optional GA4 companion to first-party analytics, disabled unless the
// website owner configures a public Measurement ID (G-XXXXXXXXXX).
// No server credentials, person IDs, search queries or event bodies reach GA4.
export function GoogleAnalytics4() {
  useEffect(() => {
    const id = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
    if (!id || !/^G-[A-Z0-9]{5,20}$/.test(id)) return;
    const host = location.hostname.toLowerCase();
    if (host !== "apostolicguide.com" && host !== "www.apostolicguide.com") return;
    if (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    if (document.querySelector('script[data-ag-ga4="true"]')) return;

    type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...params: unknown[]) => void };
    const w = window as AnalyticsWindow;
    w.dataLayer = w.dataLayer ?? [];
    w.gtag = (...params: unknown[]) => { w.dataLayer?.push(params); };
    w.gtag("js", new Date());
    // Explicit page_view is dispatched by ProductAnalytics on pathname change.
    // Never count #step-N history changes as separate Google page views.
    w.gtag("config", id, { send_page_view: false, allow_google_signals: false });
    const script = document.createElement("script");
    script.async = true;
    script.dataset.agGa4 = "true";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
  }, []);
  return null;
}

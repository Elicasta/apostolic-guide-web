"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type EventName =
  | "page_viewed"
  | "presence_heartbeat"
  | "topic_opened"
  | "answer_opened"
  | "article_opened"
  | "scripture_opened"
  | "pathway_started"
  | "pathway_step_completed"
  | "pathway_completed"
  | "search_submitted"
  | "search_result_opened"
  | "search_no_results"
  | "article_completed"
  | "app_link_clicked"
  | "content_shared"
  | "audio_started"
  | "audio_progress"
  | "audio_completed";

type EventProperties = Record<string, string | number | boolean | null>;

type EventPayload = {
  name: EventName;
  path: string;
  anonymousId: string;
  properties?: EventProperties;
};

const ANONYMOUS_KEY = "ag_anonymous_id";
const SESSION_KEY = "ag_session_id";
const ATTRIBUTION_KEY = "ag_campaign_attribution";

function getAnonymousId() {
  const stored = window.localStorage.getItem(ANONYMOUS_KEY);
  if (stored) return stored;
  const value = crypto.randomUUID();
  window.localStorage.setItem(ANONYMOUS_KEY, value);
  return value;
}

function getSessionId() {
  const stored = window.sessionStorage.getItem(SESSION_KEY);
  if (stored) return stored;
  const value = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_KEY, value);
  return value;
}

function getCampaignAttribution(): EventProperties {
  const search = new URLSearchParams(location.search);
  const campaign = search.get("utm_campaign");
  if (campaign) {
    const attribution: EventProperties = {
      _utm_source: search.get("utm_source"),
      _utm_medium: search.get("utm_medium"),
      _utm_campaign: campaign,
      _utm_content: search.get("utm_content"),
      _utm_term: search.get("utm_term")
    };
    try { window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution)); } catch {}
    return attribution;
  }

  try {
    const stored = window.sessionStorage.getItem(ATTRIBUTION_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as EventProperties;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function setCrossDomainAnonymousCookie(id: string) {
  const isProductionDomain = location.hostname === "apostolicguide.com"
    || location.hostname.endsWith(".apostolicguide.com");
  const domain = isProductionDomain ? "; Domain=.apostolicguide.com" : "";
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `ag_anonymous_id=${encodeURIComponent(id)}; Path=/${domain}; SameSite=Lax; Max-Age=31536000${secure}`;
}

function sendEvent(payload: EventPayload) {
  const body = JSON.stringify({
    ...payload,
    properties: { ...(payload.properties ?? {}), ...getCampaignAttribution() },
    sessionId: getSessionId(),
    referrer: document.referrer || null,
    viewportWidth: window.innerWidth
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics/events", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/analytics/events", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
    keepalive: true
  });
}

export function trackEvent(name: EventName, properties?: EventProperties) {
  if (typeof window === "undefined" || navigator.doNotTrack === "1") return;
  if (location.pathname.startsWith("/admin")) return;
  const anonymousId = getAnonymousId();
  setCrossDomainAnonymousCookie(anonymousId);
  sendEvent({
    name,
    path: `${location.pathname}${location.search}`,
    anonymousId,
    properties
  });
}

function contentOpenEvent(pathname: string): { name: EventName; key: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const [section, ...rest] = segments;
  const key = rest.join("/");
  if (section === "topics") return { name: "topic_opened", key };
  if (section === "answers") return { name: "answer_opened", key };
  if (section === "articles") return { name: "article_opened", key };
  if (section === "scripture") return { name: "scripture_opened", key };
  if (section === "pathways") return { name: "pathway_started", key };
  return null;
}

export function ProductAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const lastPage = useRef("");

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const path = `${pathname}${search ? `?${search}` : ""}`;
    if (lastPage.current === path) return;
    lastPage.current = path;

    trackEvent("page_viewed", { source: "WEBSITE" });
    const opened = contentOpenEvent(pathname);
    if (opened) trackEvent(opened.name, { contentKey: opened.key });
  }, [pathname, search]);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;

    const heartbeat = () => {
      if (document.visibilityState !== "visible") return;
      trackEvent("presence_heartbeat", { visible: true });
    };

    heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);
    document.addEventListener("visibilitychange", heartbeat);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/articles/")) return;

    let activeStartedAt = document.visibilityState === "visible" ? Date.now() : null;
    let activeMilliseconds = 0;
    let maximumScrollPercent = 0;
    let sent = false;

    const updateScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      maximumScrollPercent = scrollable <= 0
        ? 100
        : Math.max(maximumScrollPercent, Math.min(100, Math.round((window.scrollY / scrollable) * 100)));
    };

    const updateVisibility = () => {
      if (document.visibilityState === "hidden" && activeStartedAt !== null) {
        activeMilliseconds += Date.now() - activeStartedAt;
        activeStartedAt = null;
      } else if (document.visibilityState === "visible" && activeStartedAt === null) {
        activeStartedAt = Date.now();
      }
    };

    const currentActiveSeconds = () => Math.floor((activeMilliseconds + (activeStartedAt === null ? 0 : Date.now() - activeStartedAt)) / 1000);
    const maybeComplete = () => {
      if (sent || maximumScrollPercent < 85 || currentActiveSeconds() < 30) return;
      sent = true;
      trackEvent("article_completed", {
        contentKey: pathname.slice("/articles/".length),
        activeSeconds: currentActiveSeconds(),
        maximumScrollPercent
      });
    };

    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    document.addEventListener("visibilitychange", updateVisibility);
    const interval = window.setInterval(maybeComplete, 5000);

    return () => {
      window.removeEventListener("scroll", updateScroll);
      document.removeEventListener("visibilitychange", updateVisibility);
      window.clearInterval(interval);
    };
  }, [pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      const url = new URL(anchor.href, location.href);

      if (url.hostname === "app.apostolicguide.com") {
        trackEvent("app_link_clicked", {
          target: `${url.pathname}${url.search}`,
          placement: url.searchParams.get("placement"),
          origin: url.searchParams.get("origin")
        });
        return;
      }

      if (location.pathname === "/search" && anchor.classList.contains("search-result")) {
        trackEvent("search_result_opened", {
          query: new URLSearchParams(location.search).get("q"),
          destination: `${url.pathname}${url.search}`
        });
      }
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  return null;
}

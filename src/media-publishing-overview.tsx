"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, CalendarDays, Instagram, Mic2, Music2, RefreshCw, Send, Youtube } from "lucide-react";

type PlatformStat = {
  platform: "youtube" | "instagram" | "tiktok" | "threads";
  views: number;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  capturedAt: string | null;
  records: number;
  followers?: number;
  mediaCount?: number;
  source?: "insights" | "live-feed" | "none";
};
type CalendarItem = { id: string; title: string; content_type: string; platform: string | null; status: string; scheduled_for: string | null; published_at: string | null; source?: string | null; created_at: string };
type Credential = { platform: string; accountAuthorized: boolean; accountLabel: string | null };
type Payload = { platforms: PlatformStat[]; calendarItems: CalendarItem[]; credentials: Credential[]; instagramLive?: { username: string | null; followers: number; mediaCount: number; recentPosts: number; likes: number; comments: number; capturedAt: string | null } | null };
const EMPTY: Payload = { platforms: [], calendarItems: [], credentials: [], instagramLive: null };

function compact(value: number) { return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value || 0); }
function Icon({ platform }: { platform: string }) {
  if (platform === "youtube") return <Youtube size={18}/>;
  if (platform === "instagram") return <Instagram size={18}/>;
  if (platform === "threads") return <span className="media-thread-glyph">@</span>;
  return <span className="media-tiktok-glyph">♪</span>;
}

export function MediaPublishingOverviewPortal() {
  const pathname = usePathname();
  const [target, setTarget] = useState<Element | null>(null);
  const [calendarTarget, setCalendarTarget] = useState<Element | null>(null);
  const [data, setData] = useState<Payload>(EMPTY);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/media-overview", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (response.ok) setData({ ...EMPTY, ...json });
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (pathname !== "/admin/publish") { setTarget(null); setCalendarTarget(null); return; }
    const sync = () => {
      const next = document.querySelector(".channel-publishing-page") || document.querySelector(".channel-empty");
      const nextCalendar = document.querySelector(".publishing-calendar-panel");
      setTarget((current) => current === next ? current : next);
      setCalendarTarget((current) => current === nextCalendar ? current : nextCalendar);
    };
    sync();
    const timer = window.setInterval(sync, 500);
    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), 60000);
    return () => { window.clearInterval(timer); window.clearInterval(refreshTimer); };
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const credentialMap = useMemo(() => new Map(data.credentials.map((item) => [item.platform, item])), [data.credentials]);
  const drafts = data.calendarItems.filter((item) => item.status === "draft" || item.status === "ready");
  const upcoming = data.calendarItems.filter((item) => item.scheduled_for).sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime()).slice(0, 8);
  const platforms = ["youtube", "instagram", "tiktok", "threads"] as const;
  if (pathname !== "/admin/publish") return null;

  const overview = target ? createPortal(<section className="media-overview">
    <div className="media-overview-head"><div><span className="section-kicker">Media control center</span><h2>Publishing + live performance</h2><p>Live account/feed data fills the gaps until deeper provider insight snapshots are available.</p></div><div className="media-overview-actions"><Link className="button" href="/admin/content-calendar"><CalendarDays size={15}/> Calendar</Link><button type="button" className="button" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={15}/> Refresh stats</button></div></div>
    <div className="media-stat-grid">{platforms.map((platform) => {
      const stat = data.platforms.find((item) => item.platform === platform);
      const credential = credentialMap.get(platform);
      const hasInsights = Boolean(stat?.views || stat?.impressions || stat?.reach);
      const liveInstagram = platform === "instagram" && stat?.source === "live-feed";
      const primaryValue = hasInsights ? (stat?.views || stat?.impressions || 0) : liveInstagram ? (stat?.followers || 0) : 0;
      const primaryLabel = hasInsights ? (stat?.views ? "views" : "impressions") : liveInstagram ? "followers" : "metrics";
      return <article className={`media-stat-card ${platform}`} key={platform}>
        <div className="media-stat-card-head"><span><Icon platform={platform}/></span><div><strong>{platform === "youtube" ? "YouTube" : platform === "instagram" ? "Instagram" : platform === "tiktok" ? "TikTok" : "Threads"}</strong><small>{credential?.accountAuthorized ? credential.accountLabel || "Connected" : "Connection / sync pending"}</small></div></div>
        <div className="media-stat-primary"><strong>{compact(primaryValue)}</strong><span>{primaryLabel}</span></div>
        <div className="media-stat-secondary">{liveInstagram ? <><span><b>{compact(stat?.mediaCount || 0)}</b> posts</span><span><b>{compact(stat?.likes || 0)}</b> recent likes</span><span><b>{compact(stat?.comments || 0)}</b> recent comments</span></> : <><span><b>{compact(stat?.reach || 0)}</b> reach</span><span><b>{compact(stat?.likes || 0)}</b> likes</span><span><b>{compact((stat?.comments || 0) + (stat?.shares || 0) + (stat?.saves || 0))}</b> actions</span></>}</div>
        <small className="media-stat-freshness">{stat?.capturedAt ? `${stat.source === "live-feed" ? "Live feed checked" : "Synced"} ${new Date(stat.capturedAt).toLocaleString()}` : credential?.accountAuthorized ? "Connected · deeper metrics not synced yet" : "Not connected"}</small>
      </article>;
    })}</div>

    <div className="media-lane-grid">
      <article className="media-lane-card instagram-lane"><div className="media-lane-icon"><Instagram size={20}/></div><div><strong>Instagram Publishing Suite</strong><p>Carousels, single posts, stories and reels share the Pathway asset library and calendar.</p><span>{drafts.filter((item) => item.platform === "instagram").length} drafts in pipeline</span></div><div className="media-lane-actions"><Link className="button" href="/admin/carousel-studio">Create social asset</Link><Link className="button" href="/admin/content-calendar">View feed + calendar</Link></div></article>
      <article className="media-lane-card"><div className="media-lane-icon threads"><span>@</span></div><div><strong>Threads Studio</strong><p>Generate one post or the week, run theology review, then publish or schedule.</p><span>{drafts.filter((item) => item.platform === "threads").length} Threads drafts</span></div><div className="media-lane-actions"><Link className="button" href="/admin/threads-studio">Open Threads Studio</Link></div></article>
      <article className="media-lane-card"><div className="media-lane-icon"><Music2 size={20}/></div><div><strong>Music</strong><p>Release artwork, songs, clips, and distribution metrics.</p><span>Lane reserved</span></div></article>
      <article className="media-lane-card"><div className="media-lane-icon"><Mic2 size={20}/></div><div><strong>Podcast</strong><p>Episodes, clips, audio platforms, and listener metrics.</p><span>Lane reserved</span></div></article>
    </div>

    <div className="media-pipeline-grid"><article className="media-pipeline-card"><div className="media-pipeline-title"><BarChart3 size={17}/><div><strong>Content pipeline</strong><span>{drafts.length} active drafts</span></div></div>{drafts.length ? <div className="media-draft-list">{drafts.slice(0, 6).map((item) => <div key={item.id}><span className={`media-type-badge ${item.content_type}`}>{item.content_type}</span><div><strong>{item.title}</strong><small>{item.platform || "unassigned"} · {item.status}</small></div></div>)}</div> : <p>No staged content yet. Saved Studio assets can be handed into Publishing and the calendar.</p>}</article><article className="media-pipeline-card"><div className="media-pipeline-title"><Send size={17}/><div><strong>Next on calendar</strong><span>{upcoming.length} scheduled</span></div></div>{upcoming.length ? <div className="media-draft-list">{upcoming.slice(0, 5).map((item) => <div key={item.id}><span className={`media-type-badge ${item.content_type}`}>{item.platform || item.content_type}</span><div><strong>{item.title}</strong><small>{new Date(item.scheduled_for!).toLocaleString()}</small></div></div>)}</div> : <p>Nothing scheduled in the cross-media calendar yet.</p>}</article></div>
  </section>, target) : null;

  const calendar = calendarTarget ? createPortal(<section className="media-calendar-extension"><div className="media-pipeline-title"><CalendarDays size={17}/><div><strong>Cross-media calendar</strong><span>Studio drafts, scheduled content and synced Instagram publications.</span></div></div>{data.calendarItems.length ? <div className="media-draft-list">{data.calendarItems.slice(0, 10).map((item) => <div key={item.id}><span className={`media-type-badge ${item.content_type}`}>{item.content_type}</span><div><strong>{item.title}</strong><small>{item.platform || "unassigned"} · {item.published_at ? `published ${new Date(item.published_at).toLocaleDateString()}` : item.scheduled_for ? new Date(item.scheduled_for).toLocaleString() : item.status}</small></div></div>)}</div> : <p>No cross-media items yet.</p>}<Link className="button" href="/admin/content-calendar">Open full calendar</Link></section>, calendarTarget) : null;
  return <>{overview}{calendar}</>;
}

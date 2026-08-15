"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Instagram, Loader2, RefreshCw } from "lucide-react";

type CalendarItem = {
  id: string;
  pathway_slug: string | null;
  title: string;
  content_type: string;
  platform: string | null;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  source: string | null;
  source_ref: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

type Payload = { items?: CalendarItem[]; error?: string };

function dateKey(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function itemDate(item: CalendarItem) {
  return item.published_at || item.scheduled_for || item.updated_at;
}

function metadataString(item: CalendarItem, key: string) {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value : null;
}

function metadataNumber(item: CalendarItem, key: string) {
  const value = Number(item.metadata?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function ContentCalendarStudio() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading calendar…");
  const [cursor, setCursor] = useState(() => new Date());

  const load = useCallback(async (syncInstagram = false) => {
    if (busy) return;
    setBusy(true);
    try {
      if (syncInstagram) {
        const sync = await fetch("/api/admin/content-calendar/instagram", { method: "POST" });
        const result = await sync.json().catch(() => ({}));
        if (!sync.ok) throw new Error(result.error || "Instagram feed sync failed.");
      }
      const response = await fetch("/api/admin/content-calendar", { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as Payload;
      if (!response.ok) throw new Error(result.error || "Calendar could not be loaded.");
      setItems(result.items ?? []);
      setMessage(syncInstagram ? "Instagram feed synced with the Studio calendar." : "Calendar up to date.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar refresh failed.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  useEffect(() => { void load(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  const cells = Array.from({ length: leading + daysInMonth }, (_, index) => index < leading ? null : index - leading + 1);
  while (cells.length % 7) cells.push(null);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = dateKey(itemDate(item));
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [items]);

  const instagramFeed = items.filter((item) => item.source === "instagram-feed").sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());
  const scheduled = items.filter((item) => item.status === "scheduled");
  const drafts = items.filter((item) => item.status === "draft" || item.status === "ready");
  const monthName = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });

  return <div className="content-calendar-page">
    <div className="studio-page-heading content-calendar-heading">
      <div><span className="eyebrow">Distribution · Calendar</span><h1>Content Calendar</h1><p className="admin-lede">Planned Studio content and the real Instagram feed share one timeline. Published Instagram media is synced back into the calendar instead of living in a separate world.</p></div>
      <button className="button primary" type="button" disabled={busy} onClick={() => void load(true)}>{busy ? <Loader2 className="spin" size={16}/> : <RefreshCw size={16}/>} Sync Instagram</button>
    </div>

    <div className="content-calendar-kpis">
      <article><strong>{instagramFeed.length}</strong><span>Instagram posts synced</span></article>
      <article><strong>{scheduled.length}</strong><span>Scheduled</span></article>
      <article><strong>{drafts.length}</strong><span>Draft / ready</span></article>
      <article><strong>{items.filter((item) => item.pathway_slug).length}</strong><span>Pathway-linked</span></article>
    </div>

    <section className="admin-card calendar-month-card">
      <div className="calendar-month-head"><button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}>Previous</button><div><span className="section-kicker">Master calendar</span><h2>{monthName}</h2></div><button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}>Next</button></div>
      <div className="calendar-weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-month-grid">{cells.map((day, index) => {
        if (!day) return <div className="calendar-day is-empty" key={`empty-${index}`}/>;
        const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayItems = byDay.get(key) ?? [];
        return <div className="calendar-day" key={key}><strong>{day}</strong><div>{dayItems.slice(0, 4).map((item) => <span className={`calendar-chip is-${item.status}`} key={item.id}><i>{item.platform === "instagram" ? "IG" : item.platform === "threads" ? "TH" : item.content_type.slice(0, 2).toUpperCase()}</i>{item.title}</span>)}{dayItems.length > 4 ? <small>+{dayItems.length - 4} more</small> : null}</div></div>;
      })}</div>
    </section>

    <section className="admin-card instagram-feed-calendar">
      <div className="calendar-section-head"><div><span className="section-kicker">Instagram feed</span><h2>Published on @apostolicguide</h2><p>These are imported from Instagram and linked to the same calendar used by Studio drafts and scheduled posts.</p></div><Instagram size={25}/></div>
      {instagramFeed.length ? <div className="instagram-feed-grid">{instagramFeed.slice(0, 18).map((item) => {
        const preview = metadataString(item, "thumbnail_url") || metadataString(item, "media_url");
        const permalink = metadataString(item, "permalink");
        return <article key={item.id}>{preview ? <img src={preview} alt="" loading="lazy"/> : <div className="instagram-feed-placeholder"><Instagram size={26}/></div>}<div><span>{item.content_type}</span><strong>{item.title}</strong><small>{metadataNumber(item, "like_count")} likes · {metadataNumber(item, "comments_count")} comments</small>{permalink ? <a href={permalink} target="_blank" rel="noreferrer">Open on Instagram <ExternalLink size={13}/></a> : null}</div></article>;
      })}</div> : <div className="calendar-empty"><CalendarDays size={28}/><strong>No Instagram feed items synced yet.</strong><span>Use Sync Instagram to pull the current feed into Studio.</span></div>}
    </section>

    <p className="content-calendar-status">{message}</p>
  </div>;
}

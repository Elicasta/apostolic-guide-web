"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, ExternalLink, Instagram, Loader2, RefreshCw, Send } from "lucide-react";

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
  return item.published_at || item.scheduled_for;
}

function metadataString(item: CalendarItem, key: string) {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value : null;
}

function metadataNumber(item: CalendarItem, key: string) {
  const value = Number(item.metadata?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function localInputValue(value: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultScheduleValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(12, 0, 0, 0);
  return localInputValue(date.toISOString());
}

export function ContentCalendarStudio() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [busy, setBusy] = useState<string | null>("load");
  const [message, setMessage] = useState("Loading calendar…");
  const [cursor, setCursor] = useState(() => new Date());
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async (syncInstagram = false) => {
    setBusy(syncInstagram ? "instagram" : "load");
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
      setBusy(null);
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  async function updateItem(id: string, values: Record<string, unknown>, successMessage: string) {
    setBusy(`item:${id}`);
    try {
      const response = await fetch("/api/admin/content-calendar", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...values })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Calendar item could not be updated.");
      setItems((current) => current.map((item) => item.id === id ? data.item as CalendarItem : item));
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar item could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  async function scheduleItem(item: CalendarItem) {
    const value = scheduleDrafts[item.id] || localInputValue(item.scheduled_for) || defaultScheduleValue();
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) return setMessage("Choose a valid schedule time.");
    await updateItem(item.id, { scheduledFor: when.toISOString(), status: "scheduled" }, `${item.title} scheduled for ${when.toLocaleString()}.`);
  }

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
      list.sort((a, b) => new Date(itemDate(a) || 0).getTime() - new Date(itemDate(b) || 0).getTime());
      map.set(key, list);
    }
    return map;
  }, [items]);

  const instagramFeed = items.filter((item) => item.source === "instagram-feed").sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());
  const scheduled = items.filter((item) => item.status === "scheduled" && item.scheduled_for);
  const unscheduled = items.filter((item) => (item.status === "draft" || item.status === "ready" || item.status === "idea") && !item.scheduled_for && item.source !== "instagram-feed");
  const pathwayLinked = items.filter((item) => item.pathway_slug).length;
  const monthName = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });

  return <div className="content-calendar-page">
    <div className="studio-page-heading content-calendar-heading">
      <div><span className="eyebrow">Distribution · Calendar</span><h1>Content Calendar</h1><p className="admin-lede">Planned Studio content and the real Instagram feed share one timeline. Unscheduled work stays in a production queue until you assign a real day.</p></div>
      <button className="button primary" type="button" disabled={Boolean(busy)} onClick={() => void load(true)}>{busy === "instagram" ? <Loader2 className="spin" size={16}/> : <RefreshCw size={16}/>} Sync Instagram</button>
    </div>

    <div className="content-calendar-kpis">
      <article><strong>{instagramFeed.length}</strong><span>Instagram posts synced</span></article>
      <article><strong>{scheduled.length}</strong><span>Scheduled</span></article>
      <article><strong>{unscheduled.length}</strong><span>Ready to schedule</span></article>
      <article><strong>{pathwayLinked}</strong><span>Pathway-linked</span></article>
    </div>

    <section className="admin-card calendar-ready-queue">
      <div className="calendar-section-head"><div><span className="section-kicker">Production queue</span><h2>Ready to Schedule</h2><p>Assets handed off from Carousel Studio, Video Studio, Threads Studio, and other publishing lanes wait here until you give them a real date.</p></div><Clock3 size={25}/></div>
      {unscheduled.length ? <div className="calendar-ready-list">{unscheduled.slice(0, 30).map((item) => {
        const value = scheduleDrafts[item.id] ?? localInputValue(item.scheduled_for) ?? defaultScheduleValue();
        return <article key={item.id}><div className="calendar-ready-type"><i>{item.platform === "instagram" ? "IG" : item.platform === "threads" ? "TH" : item.platform === "youtube" ? "YT" : item.content_type.slice(0,2).toUpperCase()}</i><div><span>{item.content_type} · {item.status}</span><strong>{item.title}</strong><small>{item.pathway_slug ? `Pathway: ${item.pathway_slug.replaceAll("-", " ")}` : item.source || "Studio"}</small></div></div><div className="calendar-ready-scheduler"><input type="datetime-local" value={value} onChange={(event) => setScheduleDrafts((current) => ({ ...current, [item.id]: event.target.value }))}/><button type="button" className="button primary" disabled={Boolean(busy)} onClick={() => void scheduleItem(item)}>{busy === `item:${item.id}` ? <Loader2 className="spin" size={14}/> : <Send size={14}/>} Schedule</button></div></article>;
      })}</div> : <div className="calendar-empty compact"><CalendarDays size={24}/><strong>Queue is clear.</strong><span>New Studio assets appear here when you add them to the calendar.</span></div>}
    </section>

    <section className="admin-card calendar-month-card">
      <div className="calendar-month-head"><button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}>Previous</button><div><span className="section-kicker">Master calendar</span><h2>{monthName}</h2></div><button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}>Next</button></div>
      <div className="calendar-weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-month-grid">{cells.map((day, index) => {
        if (!day) return <div className="calendar-day is-empty" key={`empty-${index}`}/>;
        const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayItems = byDay.get(key) ?? [];
        return <div className="calendar-day" key={key}><strong>{day}</strong><div>{dayItems.slice(0, 4).map((item) => <span className={`calendar-chip is-${item.status}`} key={item.id}><i>{item.platform === "instagram" ? "IG" : item.platform === "threads" ? "TH" : item.platform === "youtube" ? "YT" : item.content_type.slice(0, 2).toUpperCase()}</i>{item.title}</span>)}{dayItems.length > 4 ? <small>+{dayItems.length - 4} more</small> : null}</div></div>;
      })}</div>
    </section>

    <section className="admin-card instagram-feed-calendar">
      <div className="calendar-section-head"><div><span className="section-kicker">Instagram feed</span><h2>Published on @apostolicguide</h2><p>Published media is imported from Instagram and displayed on the same dates it actually went live.</p></div><Instagram size={25}/></div>
      {instagramFeed.length ? <div className="instagram-feed-grid">{instagramFeed.slice(0, 18).map((item) => {
        const preview = metadataString(item, "thumbnail_url") || metadataString(item, "media_url");
        const permalink = metadataString(item, "permalink");
        return <article key={item.id}>{preview ? <img src={preview} alt="" loading="lazy"/> : <div className="instagram-feed-placeholder"><Instagram size={26}/></div>}<div><span>{item.content_type}</span><strong>{item.title}</strong><small>{metadataNumber(item, "like_count")} likes · {metadataNumber(item, "comments_count")} comments</small>{permalink ? <a href={permalink} target="_blank" rel="noreferrer">Open on Instagram <ExternalLink size={13}/></a> : null}</div></article>;
      })}</div> : <div className="calendar-empty"><CalendarDays size={28}/><strong>No Instagram feed items synced yet.</strong><span>Use Sync Instagram to pull the current feed into Studio.</span></div>}
    </section>

    <p className="content-calendar-status">{message}</p>
  </div>;
}

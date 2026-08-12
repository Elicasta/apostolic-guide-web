"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Instagram,
  Loader2,
  Play,
  RefreshCw,
  Scissors,
  Send,
  Settings,
  Sparkles,
  Youtube
} from "lucide-react";
import type { PathwayVideoPublishingMetadata } from "@/pathway-video-publishing";
import type { SocialPublishingCredentialStatus } from "@/social-publishing-integrations";

type Render = {
  id: string;
  pathway_slug: string;
  asset_id: string | null;
  format: "youtube" | "vertical" | "square";
  status: "queued" | "rendering" | "completed" | "failed";
  output_url: string | null;
  requested_at: string;
  completed_at: string | null;
};

type Publication = {
  id: string;
  pathway_slug: string;
  asset_id: string | null;
  platform: string;
  status: "draft" | "ready" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  external_post_id: string | null;
  published_url: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  error_message: string | null;
  metadata: unknown;
  created_at: string;
};

type SocialClip = {
  id: string;
  pathway_slug: string;
  source_render_id: string;
  asset_id: string | null;
  platform: "instagram" | "tiktok" | "both";
  rank: number;
  score: number;
  start_seconds: number;
  end_seconds: number;
  hook: string;
  title: string;
  rationale: string;
  caption: string;
  status: "candidate" | "queued" | "rendering" | "completed" | "failed" | "archived";
  output_url: string | null;
  error: string | null;
  model: string | null;
  created_at: string;
  completed_at: string | null;
};

type PublishingPackage = {
  slug: string;
  title: string;
  summary: string;
  youtubeRender: Render | null;
  verticalRender: Render | null;
  squareRender: Render | null;
  publishingKit: {
    metadata: PathwayVideoPublishingMetadata;
    thumbnailBackgroundUrl: string | null;
    updatedAt: string;
  } | null;
  publications: Publication[];
  socialClips: SocialClip[];
};

type SuiteTab = "publish" | "clips" | "calendar";
type Platform = "youtube" | "instagram" | "tiktok";

function platformStatus(packageItem: PublishingPackage, platform: string) {
  return packageItem.publications.find((publication) => publication.platform === platform && publication.status !== "cancelled") ?? null;
}

function StatusPill({ publication }: { publication: Publication | null }) {
  if (!publication) return <span className="channel-status neutral">Not published</span>;
  if (publication.status === "published") return <span className="channel-status success"><Check size={12}/> Published</span>;
  if (publication.status === "publishing") return <span className="channel-status working"><Loader2 className="spin" size={12}/> Publishing</span>;
  if (publication.status === "failed") return <span className="channel-status danger"><CircleAlert size={12}/> Failed</span>;
  if (publication.status === "scheduled") return <span className="channel-status working"><Clock3 size={12}/> Scheduled</span>;
  return <span className="channel-status neutral">{publication.status}</span>;
}

function seconds(value: number) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function PlatformIcon({ platform, size = 17 }: { platform: Platform; size?: number }) {
  if (platform === "youtube") return <Youtube size={size}/>;
  if (platform === "instagram") return <Instagram size={size}/>;
  return <span className="tiktok-glyph small">♪</span>;
}

export function ChannelPublishing({ packages, credentials, canPublish }: {
  packages: PublishingPackage[];
  credentials: SocialPublishingCredentialStatus[];
  canPublish: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [privacy, setPrivacy] = useState<Record<string, "private" | "unlisted" | "public">>({});
  const [selectedSlug, setSelectedSlug] = useState(packages[0]?.slug ?? "");
  const [tab, setTab] = useState<SuiteTab>("publish");
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [scheduleTimes, setScheduleTimes] = useState<Record<string, string>>({});
  const [selectedClipIds, setSelectedClipIds] = useState<Record<string, string>>({});
  const [clipsBySlug, setClipsBySlug] = useState<Record<string, SocialClip[]>>(() => Object.fromEntries(packages.map((item) => [item.slug, item.socialClips])));
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const credentialMap = useMemo(() => new Map(credentials.map((credential) => [credential.platform, credential])), [credentials]);
  const selected = packages.find((item) => item.slug === selectedSlug) ?? packages[0] ?? null;
  const youtube = credentialMap.get("youtube");
  const instagram = credentialMap.get("instagram");
  const tiktok = credentialMap.get("tiktok");
  const selectedClips = selected ? (clipsBySlug[selected.slug] ?? []).filter((clip) => clip.status !== "archived").sort((a, b) => a.rank - b.rank) : [];
  const completedClips = selectedClips.filter((clip) => clip.status === "completed" && clip.output_url);
  const selectedClip = selected ? completedClips.find((clip) => clip.id === selectedClipIds[selected.slug]) ?? null : null;

  const calendarItems = useMemo(() => packages.flatMap((item) => item.publications.flatMap((publication) => {
    const timestamp = publication.scheduled_for || publication.published_at;
    if (!timestamp) return [];
    return [{ ...publication, pathwayTitle: item.title, timestamp }];
  })), [packages]);

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      return day;
    });
  }, [month]);

  function key(slug: string, action: string) { return `${slug}:${action}`; }
  function setMessage(messageKey: string, value: string) { setMessages((current) => ({ ...current, [messageKey]: value })); }

  async function publishNow(item: PublishingPackage, target: "youtube" | "instagram") {
    const sourceClip = target === "instagram" ? selectedClip : null;
    const render = target === "youtube" ? item.youtubeRender : item.verticalRender;
    const actionKey = key(item.slug, `publish:${target}`);
    if (!sourceClip && !render) return;
    setBusy(actionKey);
    setMessage(actionKey, target === "youtube" ? "Uploading to YouTube…" : "Sending Reel to Instagram…");
    try {
      const response = await fetch("/api/admin/publishing/publish-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: item.slug,
          platform: target,
          renderId: sourceClip ? undefined : render?.id,
          clipId: sourceClip?.id,
          privacyStatus: target === "youtube" ? (privacy[item.slug] ?? "private") : undefined
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `${target} publish failed.`);
      setMessage(actionKey, data.message || "Published successfully.");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage(actionKey, error instanceof Error ? error.message : `${target} publish failed.`);
    } finally {
      setBusy(null);
    }
  }

  async function schedule(item: PublishingPackage, target: Platform) {
    const scheduleKey = key(item.slug, `schedule:${target}`);
    const localValue = scheduleTimes[scheduleKey];
    if (!localValue) {
      setMessage(scheduleKey, "Choose a date and time first.");
      return;
    }
    const date = new Date(localValue);
    if (!Number.isFinite(date.getTime())) {
      setMessage(scheduleKey, "Choose a valid date and time.");
      return;
    }
    const sourceClip = target !== "youtube" ? selectedClip : null;
    const render = target === "youtube" ? item.youtubeRender : item.verticalRender;
    if (!sourceClip && !render) {
      setMessage(scheduleKey, "Render the required video first.");
      return;
    }
    setBusy(scheduleKey);
    setMessage(scheduleKey, "Adding to publishing calendar…");
    try {
      const response = await fetch("/api/admin/publishing/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: item.slug,
          platform: target,
          renderId: sourceClip ? undefined : render?.id,
          clipId: sourceClip?.id,
          scheduledFor: date.toISOString(),
          privacyStatus: target === "youtube" ? (privacy[item.slug] ?? "private") : undefined
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Scheduling failed.");
      setMessage(scheduleKey, data.message || "Scheduled.");
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setMessage(scheduleKey, error instanceof Error ? error.message : "Scheduling failed.");
    } finally {
      setBusy(null);
    }
  }

  async function analyzeClips(item: PublishingPackage) {
    const actionKey = key(item.slug, "analyze-clips");
    setBusy(actionKey);
    setMessage(actionKey, "AI is reading the approved narration and timing the strongest moments…");
    try {
      const response = await fetch("/api/admin/publishing/viral-clips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: item.slug, force: true })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "AI clip analysis failed.");
      const clips = Array.isArray(data.clips) ? data.clips as SocialClip[] : [];
      setClipsBySlug((current) => ({ ...current, [item.slug]: clips }));
      setMessage(actionKey, clips.length ? `Found ${clips.length} strong short-form moments.` : "No reliable clips were returned.");
    } catch (error) {
      setMessage(actionKey, error instanceof Error ? error.message : "AI clip analysis failed.");
    } finally {
      setBusy(null);
    }
  }

  async function renderClip(item: PublishingPackage, clip: SocialClip) {
    const actionKey = key(item.slug, `clip:${clip.id}`);
    setBusy(actionKey);
    setMessage(actionKey, "Cutting the selected 9:16 segment…");
    try {
      const response = await fetch("/api/admin/publishing/viral-clips/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clipId: clip.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Clip render failed to start.");
      setClipsBySlug((current) => ({
        ...current,
        [item.slug]: (current[item.slug] ?? []).map((currentClip) => currentClip.id === clip.id ? { ...currentClip, status: "queued" } : currentClip)
      }));
      setMessage(actionKey, "Clip queued. Refresh when the render finishes.");
    } catch (error) {
      setMessage(actionKey, error instanceof Error ? error.message : "Clip render failed to start.");
    } finally {
      setBusy(null);
    }
  }

  if (!selected) return <section className="admin-card channel-empty"><Send size={24}/><h2>No publishing packages yet</h2><p>Finish a Video Studio render and generate its publishing kit. It will appear here automatically.</p><Link className="button button-primary" href="/admin/video-studio">Open Video Studio</Link></section>;

  const metadata = selected.publishingKit?.metadata;
  const publication = platformStatus(selected, platform);
  const platformRender = platform === "youtube" ? selected.youtubeRender : selected.verticalRender;
  const previewUrl = platform === "youtube" ? selected.youtubeRender?.output_url : selectedClip?.output_url || selected.verticalRender?.output_url;
  const scheduleKey = key(selected.slug, `schedule:${platform}`);
  const publishKey = key(selected.slug, `publish:${platform}`);
  const analyzeKey = key(selected.slug, "analyze-clips");
  const channelAuthorized = platform === "youtube" ? youtube?.accountAuthorized : platform === "instagram" ? instagram?.accountAuthorized : tiktok?.accountAuthorized;

  return <div className="channel-publishing-page">
    <header className="channel-publishing-hero compact">
      <div>
        <span className="section-kicker">Distribution</span>
        <h1>Publishing Suite</h1>
        <p>One workspace for final video review, AI short-form cuts, publishing, and the content calendar.</p>
      </div>
      <div className="channel-publishing-hero-actions">
        <button className="button" type="button" onClick={() => window.location.reload()}><RefreshCw size={15}/> Refresh</button>
        <Link className="button" href="/admin/setup#social-publishing"><Settings size={15}/> Connections</Link>
      </div>
    </header>

    <section className="channel-connection-strip compact" aria-label="Publishing connections">
      <div className={youtube?.accountAuthorized ? "connection-pill connected" : "connection-pill"}><Youtube size={16}/><strong>YouTube</strong><span>{youtube?.accountAuthorized ? youtube.accountLabel || "Authorized" : "Connect"}</span></div>
      <div className={instagram?.accountAuthorized ? "connection-pill connected" : "connection-pill"}><Instagram size={16}/><strong>Instagram</strong><span>{instagram?.accountAuthorized ? instagram.accountLabel || "Authorized" : "Connect"}</span></div>
      <div className={tiktok?.accountAuthorized ? "connection-pill connected" : "connection-pill"}><span className="tiktok-glyph small">♪</span><strong>TikTok</strong><span>{tiktok?.accountAuthorized ? tiktok.accountLabel || "Authorized" : "Setup required"}</span></div>
    </section>

    <section className="admin-card publishing-workspace">
      <div className="publishing-toolbar">
        <label className="pathway-picker">
          <span>Pathway</span>
          <select value={selected.slug} onChange={(event) => setSelectedSlug(event.target.value)}>
            {packages.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}
          </select>
        </label>
        <div className="publishing-tabs" role="tablist" aria-label="Publishing workspace">
          <button type="button" className={tab === "publish" ? "active" : ""} onClick={() => setTab("publish")}><Send size={15}/> Publish</button>
          <button type="button" className={tab === "clips" ? "active" : ""} onClick={() => setTab("clips")}><Scissors size={15}/> AI Clips</button>
          <button type="button" className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}><CalendarDays size={15}/> Calendar</button>
        </div>
      </div>

      {tab !== "calendar" ? <div className="publishing-pathway-summary">
        <div><span className="section-kicker">Pathway package</span><h2>{selected.title}</h2><p>{selected.summary}</p></div>
        <div className="channel-readiness-row compact">
          <span className={selected.youtubeRender ? "ready" : "missing"}>{selected.youtubeRender ? <Check size={12}/> : <CircleAlert size={12}/>} 16:9</span>
          <span className={selected.verticalRender ? "ready" : "missing"}>{selected.verticalRender ? <Check size={12}/> : <CircleAlert size={12}/>} 9:16</span>
          <span className={selected.publishingKit ? "ready" : "missing"}>{selected.publishingKit ? <Check size={12}/> : <CircleAlert size={12}/>} Copy</span>
          <Link href={`/admin/video-studio?pathway=${encodeURIComponent(selected.slug)}`} className="button button-small"><Play size={13}/> Video Studio</Link>
        </div>
      </div> : null}

      {tab === "publish" ? <div className="publish-suite-panel">
        <div className="platform-tabs" role="tablist" aria-label="Publishing channel">
          {(["youtube", "instagram", "tiktok"] as Platform[]).map((item) => <button type="button" key={item} className={platform === item ? "active" : ""} onClick={() => setPlatform(item)}><PlatformIcon platform={item}/>{item === "youtube" ? "YouTube" : item === "instagram" ? "Instagram" : "TikTok"}</button>)}
        </div>

        <div className="publish-main-grid">
          <div className="publish-preview-column">
            <div className={`publish-preview-shell ${platform === "youtube" ? "wide" : "vertical"}`}>
              {previewUrl ? <video className="channel-media-preview" src={previewUrl} controls preload="metadata"/> : <div className="channel-missing-media">Render the {platform === "youtube" ? "16:9" : "9:16"} video first.</div>}
            </div>
            {platform !== "youtube" && completedClips.length ? <label className="source-picker"><span>Video source</span><select value={selectedClip?.id ?? "full"} onChange={(event) => setSelectedClipIds((current) => ({ ...current, [selected.slug]: event.target.value === "full" ? "" : event.target.value }))}><option value="full">Full Pathway 9:16</option>{completedClips.map((clip) => <option key={clip.id} value={clip.id}>AI clip #{clip.rank} · {clip.score}/100 · {seconds(Number(clip.end_seconds) - Number(clip.start_seconds))}</option>)}</select></label> : null}
            {selectedClip ? <div className="selected-clip-note"><Sparkles size={14}/><div><strong>AI-selected cut #{selectedClip.rank}</strong><span>{selectedClip.hook}</span></div></div> : null}
          </div>

          <div className="publish-control-column">
            <div className="channel-platform-head"><div><PlatformIcon platform={platform} size={20}/><strong>{platform === "youtube" ? "YouTube" : platform === "instagram" ? "Instagram Reel" : "TikTok"}</strong></div><StatusPill publication={publication}/></div>
            {platform === "youtube" ? <label><span>Title</span><textarea rows={2} readOnly value={metadata?.youtubeTitle || "Generate the publishing kit in Video Studio."}/></label> : <label><span>Caption</span><textarea rows={5} readOnly value={selectedClip?.caption || (platform === "instagram" ? metadata?.reelCaption : metadata?.tiktokCaption) || "Generate the publishing kit in Video Studio."}/></label>}
            {platform === "youtube" ? <label><span>Visibility</span><select value={privacy[selected.slug] ?? "private"} onChange={(event) => setPrivacy((current) => ({ ...current, [selected.slug]: event.target.value as "private" | "unlisted" | "public" }))}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label> : null}

            <div className="publishing-action-card">
              <div><strong>Publish now</strong><span>{platform === "tiktok" ? "Direct Post activates after TikTok approves the connection." : selectedClip ? "Publish the selected AI cut." : "Send the finished video now."}</span></div>
              {publication?.published_url ? <a className="button" href={publication.published_url} target="_blank" rel="noreferrer">Open published post <ExternalLink size={14}/></a> : <button className="button button-primary" type="button" disabled={!canPublish || !channelAuthorized || platform === "tiktok" || (!selectedClip && !platformRender) || busy === publishKey} onClick={() => platform !== "tiktok" && void publishNow(selected, platform)}>{busy === publishKey ? <Loader2 className="spin" size={15}/> : <Send size={15}/>} {platform === "tiktok" ? "TikTok setup required" : `Publish to ${platform === "youtube" ? "YouTube" : "Instagram"}`}</button>}
              {messages[publishKey] ? <p className="channel-action-message">{messages[publishKey]}</p> : null}
            </div>

            <div className="publishing-action-card schedule-card">
              <div><strong>Schedule</strong><span>{platform === "tiktok" ? "Add it to the calendar now. Posting remains manual until Direct Post is enabled." : "It will publish automatically from the queue."}</span></div>
              <input type="datetime-local" value={scheduleTimes[scheduleKey] ?? ""} onChange={(event) => setScheduleTimes((current) => ({ ...current, [scheduleKey]: event.target.value }))}/>
              <button className="button" type="button" disabled={!canPublish || (!selectedClip && !platformRender) || busy === scheduleKey} onClick={() => void schedule(selected, platform)}>{busy === scheduleKey ? <Loader2 className="spin" size={15}/> : <CalendarDays size={15}/>} Add to calendar</button>
              {messages[scheduleKey] ? <p className="channel-action-message">{messages[scheduleKey]}</p> : null}
            </div>
          </div>
        </div>
      </div> : null}

      {tab === "clips" ? <div className="ai-clips-panel">
        <div className="ai-clips-intro">
          <div className="ai-clips-intro-copy"><span className="ai-icon"><Sparkles size={18}/></span><div><span className="section-kicker">AI Moment Finder</span><h3>Find the strongest short-form cuts</h3><p>AI scores the approved narration for hook strength, clarity, completeness, tension, and shareability, then maps exact cuts back to the audio timestamps. It does not rewrite the doctrine to make it more sensational.</p></div></div>
          <button className="button button-primary" type="button" disabled={!canPublish || !selected.verticalRender || busy === analyzeKey} onClick={() => void analyzeClips(selected)}>{busy === analyzeKey ? <Loader2 className="spin" size={15}/> : <Sparkles size={15}/>} {selectedClips.length ? "Re-analyze moments" : "Find best moments"}</button>
        </div>
        {messages[analyzeKey] ? <p className="channel-action-message ai-message">{messages[analyzeKey]}</p> : null}

        {!selectedClips.length ? <div className="ai-clips-empty"><Scissors size={28}/><strong>No AI cuts yet</strong><span>Run the Moment Finder after the 9:16 video is rendered.</span></div> : <div className="ai-clip-grid">
          {selectedClips.map((clip) => {
            const clipKey = key(selected.slug, `clip:${clip.id}`);
            const clipDuration = Number(clip.end_seconds) - Number(clip.start_seconds);
            return <article className={`ai-clip-card ${clip.rank === 1 ? "top-pick" : ""}`} key={clip.id}>
              <div className="ai-clip-card-head">
                <div><span className="clip-rank">#{clip.rank}</span><div><strong>{clip.title}</strong><span>{clip.platform === "both" ? "Instagram + TikTok" : clip.platform === "instagram" ? "Instagram" : "TikTok"}</span></div></div>
                <span className="viral-score"><strong>{clip.score}</strong><small>potential</small></span>
              </div>
              {clip.output_url ? <video className="ai-clip-video" src={clip.output_url} controls preload="metadata"/> : null}
              <blockquote>{clip.hook}</blockquote>
              <p>{clip.rationale}</p>
              <div className="clip-metrics"><span>{seconds(Number(clip.start_seconds))} → {seconds(Number(clip.end_seconds))}</span><span>{seconds(clipDuration)} cut</span><span className={`clip-state ${clip.status}`}>{clip.status}</span></div>
              {clip.error ? <p className="clip-error">{clip.error}</p> : null}
              {messages[clipKey] ? <p className="channel-action-message">{messages[clipKey]}</p> : null}
              <div className="clip-actions">
                {clip.status === "completed" && clip.output_url ? <><button className="button" type="button" onClick={() => { setSelectedClipIds((current) => ({ ...current, [selected.slug]: clip.id })); setPlatform(clip.platform === "tiktok" ? "tiktok" : "instagram"); setTab("publish"); }}><Send size={14}/> Use this cut</button><a className="button" href={clip.output_url} target="_blank" rel="noreferrer">Open video <ExternalLink size={14}/></a></> : <button className="button button-primary" type="button" disabled={busy === clipKey || clip.status === "queued" || clip.status === "rendering"} onClick={() => void renderClip(selected, clip)}>{busy === clipKey || clip.status === "queued" || clip.status === "rendering" ? <Loader2 className="spin" size={14}/> : <Scissors size={14}/>} {clip.status === "queued" || clip.status === "rendering" ? "Rendering…" : "Render this cut"}</button>}
              </div>
            </article>;
          })}
        </div>}
      </div> : null}

      {tab === "calendar" ? <div className="publishing-calendar-panel">
        <div className="calendar-head"><div><span className="section-kicker">Content calendar</span><h2>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2></div><div className="calendar-nav"><button className="button button-icon" type="button" aria-label="Previous month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft size={17}/></button><button className="button" type="button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); }}>Today</button><button className="button button-icon" type="button" aria-label="Next month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight size={17}/></button></div></div>
        <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="publishing-calendar-grid">
          {calendarDays.map((day) => {
            const dayEvents = calendarItems.filter((item) => dateKey(new Date(item.timestamp)) === dateKey(day));
            const today = dateKey(day) === dateKey(new Date());
            const muted = day.getMonth() !== month.getMonth();
            return <div className={`calendar-day ${muted ? "muted" : ""} ${today ? "today" : ""}`} key={day.toISOString()}><span className="calendar-day-number">{day.getDate()}</span><div className="calendar-events">{dayEvents.map((item) => <div className={`calendar-event ${item.platform} ${item.status}`} key={item.id}><PlatformIcon platform={(item.platform === "youtube" || item.platform === "instagram" ? item.platform : "tiktok") as Platform} size={12}/><div><strong>{item.pathwayTitle}</strong><span>{new Date(item.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {item.status}</span></div></div>)}</div></div>;
          })}
        </div>
        <div className="calendar-legend"><span><i className="legend-dot scheduled"/> Scheduled</span><span><i className="legend-dot published"/> Published</span><span><i className="legend-dot failed"/> Needs attention</span></div>
      </div> : null}
    </section>
  </div>;
}

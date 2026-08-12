"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, CircleAlert, ExternalLink, Instagram, Loader2, Play, RefreshCw, Send, Settings, Youtube } from "lucide-react";
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
};

function platformStatus(packageItem: PublishingPackage, platform: string) {
  return packageItem.publications.find((publication) => publication.platform === platform) ?? null;
}

function StatusPill({ publication }: { publication: Publication | null }) {
  if (!publication) return <span className="channel-status neutral">Not published</span>;
  if (publication.status === "published") return <span className="channel-status success"><Check size={12}/> Published</span>;
  if (publication.status === "publishing") return <span className="channel-status working"><Loader2 className="spin" size={12}/> Publishing</span>;
  if (publication.status === "failed") return <span className="channel-status danger"><CircleAlert size={12}/> Failed</span>;
  if (publication.status === "scheduled") return <span className="channel-status working">Scheduled</span>;
  return <span className="channel-status neutral">{publication.status}</span>;
}

export function ChannelPublishing({ packages, credentials, canPublish }: {
  packages: PublishingPackage[];
  credentials: SocialPublishingCredentialStatus[];
  canPublish: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [privacy, setPrivacy] = useState<Record<string, "private" | "unlisted" | "public">>({});
  const [onlyReady, setOnlyReady] = useState(false);
  const credentialMap = useMemo(() => new Map(credentials.map((credential) => [credential.platform, credential])), [credentials]);

  const visiblePackages = onlyReady
    ? packages.filter((item) => item.publishingKit && (item.youtubeRender || item.verticalRender))
    : packages;

  function messageKey(slug: string, platform: string) { return `${slug}:${platform}`; }

  async function publish(slug: string, platform: "youtube" | "instagram", renderId: string) {
    const key = messageKey(slug, platform);
    setBusy(key);
    setMessages((current) => ({ ...current, [key]: platform === "youtube" ? "Uploading to YouTube…" : "Sending Reel to Instagram…" }));
    try {
      const response = await fetch(`/api/admin/publishing/${platform}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          renderId,
          privacyStatus: platform === "youtube" ? (privacy[slug] ?? "private") : undefined
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `${platform} publish failed.`);
      setMessages((current) => ({ ...current, [key]: data.message || "Published successfully." }));
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessages((current) => ({ ...current, [key]: error instanceof Error ? error.message : `${platform} publish failed.` }));
    } finally {
      setBusy(null);
    }
  }

  const youtube = credentialMap.get("youtube");
  const instagram = credentialMap.get("instagram");
  const tiktok = credentialMap.get("tiktok");

  return <div className="channel-publishing-page">
    <header className="channel-publishing-hero">
      <div>
        <span className="section-kicker">Distribution</span>
        <h1>Channel Publishing</h1>
        <p>Review finished Pathway assets, channel-specific copy, and publish state before anything leaves Apostolic Guide.</p>
      </div>
      <div className="channel-publishing-hero-actions">
        <label className="channel-ready-toggle"><input type="checkbox" checked={onlyReady} onChange={(event) => setOnlyReady(event.target.checked)}/><span>Ready only</span></label>
        <Link className="button" href="/admin/setup#social-publishing"><Settings size={15}/> Connections</Link>
      </div>
    </header>

    <section className="channel-connection-strip" aria-label="Publishing connections">
      <div className={youtube?.accountAuthorized ? "connection-card connected" : "connection-card"}><Youtube size={20}/><div><strong>YouTube</strong><span>{youtube?.accountAuthorized ? youtube.accountLabel || "Authorized" : "Not authorized"}</span></div>{youtube?.accountAuthorized ? <Check size={16}/> : <Link href="/admin/setup#social-publishing">Connect</Link>}</div>
      <div className={instagram?.accountAuthorized ? "connection-card connected" : "connection-card"}><Instagram size={20}/><div><strong>Instagram</strong><span>{instagram?.accountAuthorized ? instagram.accountLabel || "Authorized" : "Not authorized"}</span></div>{instagram?.accountAuthorized ? <Check size={16}/> : <Link href="/admin/setup#social-publishing">Connect</Link>}</div>
      <div className={tiktok?.accountAuthorized ? "connection-card connected" : "connection-card"}><span className="tiktok-glyph">♪</span><div><strong>TikTok</strong><span>{tiktok?.accountAuthorized ? tiktok.accountLabel || "Authorized" : "Setup required"}</span></div>{tiktok?.accountAuthorized ? <Check size={16}/> : <Link href="/admin/setup#social-publishing">Setup</Link>}</div>
    </section>

    {!visiblePackages.length ? <section className="admin-card channel-empty"><Send size={24}/><h2>No publishing packages yet</h2><p>Finish a Video Studio render and generate its publishing kit. It will appear here automatically.</p><Link className="button button-primary" href="/admin/video-studio">Open Video Studio</Link></section> : null}

    <div className="channel-package-list">
      {visiblePackages.map((item) => {
        const ytPublication = platformStatus(item, "youtube");
        const igPublication = platformStatus(item, "instagram");
        const ttPublication = platformStatus(item, "tiktok");
        const metadata = item.publishingKit?.metadata;
        const youtubeKey = messageKey(item.slug, "youtube");
        const instagramKey = messageKey(item.slug, "instagram");
        return <section className="admin-card channel-package" key={item.slug}>
          <div className="channel-package-head">
            <div><span className="section-kicker">Pathway package</span><h2>{item.title}</h2><p>{item.summary}</p></div>
            <Link href={`/admin/video-studio?pathway=${encodeURIComponent(item.slug)}`} className="button"><Play size={14}/> Video Studio</Link>
          </div>

          <div className="channel-readiness-row">
            <span className={item.youtubeRender ? "ready" : "missing"}>{item.youtubeRender ? <Check size={13}/> : <CircleAlert size={13}/>} YouTube 16:9</span>
            <span className={item.verticalRender ? "ready" : "missing"}>{item.verticalRender ? <Check size={13}/> : <CircleAlert size={13}/>} Vertical 9:16</span>
            <span className={item.publishingKit ? "ready" : "missing"}>{item.publishingKit ? <Check size={13}/> : <CircleAlert size={13}/>} Publishing copy</span>
            <span className={item.publishingKit?.thumbnailBackgroundUrl ? "ready" : "missing"}>{item.publishingKit?.thumbnailBackgroundUrl ? <Check size={13}/> : <CircleAlert size={13}/>} Thumbnail creative</span>
          </div>

          <div className="channel-grid">
            <article className="channel-platform-card youtube">
              <div className="channel-platform-head"><div><Youtube size={20}/><strong>YouTube</strong></div><StatusPill publication={ytPublication}/></div>
              {item.youtubeRender?.output_url ? <video className="channel-media-preview" src={item.youtubeRender.output_url} controls preload="metadata"/> : <div className="channel-missing-media">Render the 16:9 video first.</div>}
              <label><span>Title</span><textarea rows={2} readOnly value={metadata?.youtubeTitle || "Generate the publishing kit in Video Studio."}/></label>
              <label><span>Visibility</span><select value={privacy[item.slug] ?? "private"} onChange={(event) => setPrivacy((current) => ({ ...current, [item.slug]: event.target.value as "private" | "unlisted" | "public" }))}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>
              {messages[youtubeKey] ? <p className="channel-action-message">{messages[youtubeKey]}</p> : null}
              {ytPublication?.published_url ? <a className="button" href={ytPublication.published_url} target="_blank" rel="noreferrer">Open on YouTube <ExternalLink size={14}/></a> : <button className="button button-primary" type="button" disabled={!canPublish || !youtube?.accountAuthorized || !item.youtubeRender || !metadata?.youtubeTitle || busy === youtubeKey} onClick={() => item.youtubeRender && void publish(item.slug, "youtube", item.youtubeRender.id)}>{busy === youtubeKey ? <Loader2 className="spin" size={15}/> : <Youtube size={15}/>} Publish to YouTube</button>}
              {!youtube?.accountAuthorized ? <small>Connect YouTube in Setup before publishing.</small> : null}
            </article>

            <article className="channel-platform-card instagram">
              <div className="channel-platform-head"><div><Instagram size={20}/><strong>Instagram Reel</strong></div><StatusPill publication={igPublication}/></div>
              {item.verticalRender?.output_url ? <video className="channel-media-preview vertical" src={item.verticalRender.output_url} controls preload="metadata"/> : <div className="channel-missing-media">Render the 9:16 video first.</div>}
              <label><span>Caption</span><textarea rows={6} readOnly value={metadata?.reelCaption || "Generate the publishing kit in Video Studio."}/></label>
              {messages[instagramKey] ? <p className="channel-action-message">{messages[instagramKey]}</p> : null}
              {igPublication?.published_url ? <a className="button" href={igPublication.published_url} target="_blank" rel="noreferrer">Open on Instagram <ExternalLink size={14}/></a> : <button className="button button-primary" type="button" disabled={!canPublish || !instagram?.accountAuthorized || !item.verticalRender || !metadata?.reelCaption || busy === instagramKey} onClick={() => item.verticalRender && void publish(item.slug, "instagram", item.verticalRender.id)}>{busy === instagramKey ? <Loader2 className="spin" size={15}/> : <Instagram size={15}/>} Publish Reel</button>}
            </article>

            <article className="channel-platform-card tiktok">
              <div className="channel-platform-head"><div><span className="tiktok-glyph">♪</span><strong>TikTok</strong></div><StatusPill publication={ttPublication}/></div>
              {item.verticalRender?.output_url ? <video className="channel-media-preview vertical" src={item.verticalRender.output_url} controls preload="metadata"/> : <div className="channel-missing-media">Render the 9:16 video first.</div>}
              <label><span>Caption</span><textarea rows={6} readOnly value={metadata?.tiktokCaption || "Generate the publishing kit in Video Studio."}/></label>
              <button className="button" type="button" disabled><RefreshCw size={15}/> TikTok connection required</button>
              <small>TikTok Direct Post becomes active after the app has Content Posting approval and the account authorizes video.publish.</small>
            </article>
          </div>
        </section>;
      })}
    </div>
  </div>;
}

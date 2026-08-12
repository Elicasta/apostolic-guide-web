import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, Facebook, FileText, Globe2, Instagram, MessageCircle, Plus, RefreshCw, Trash2, Youtube } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { getPathwayPublishingSummary, listAvailableSocialAutomations, websitePathwayUrl } from "@/pathway-publishing";
import { listPathwayPublicationPerformance } from "@/publication-metrics";
import { archivePathwayAsset, createPathwayAsset, createPathwayPublication, deletePathwayPublication, savePathwayProfile, syncPathwayPublicationMetrics, updatePathwayAsset } from "../actions";

const assetTypes = ["youtube", "short_video", "carousel", "graphic", "story", "pdf", "email", "article", "thumbnail", "script", "print", "merch", "other"];
const assetStatuses = ["idea", "script", "ready_to_produce", "in_production", "ready_to_publish", "published", "blocked"];
const ctaTypes = ["none", "comment_keyword", "visit_pathway", "download_pdf", "watch_youtube", "open_app"];
const campaignStatuses = ["planning", "active", "paused", "complete", "archived"];
const publicationPlatforms = ["instagram", "tiktok", "youtube", "facebook"];
const platformOrder = ["youtube", "instagram", "tiktok", "facebook", "other"] as const;
type PlatformKey = (typeof platformOrder)[number];

function label(value: string) { return value.replaceAll("_", " "); }
function compact(value: number | null | undefined) { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0); }
function metric(row: Record<string, unknown> | null | undefined, key: string) { const n = Number(row?.[key] ?? 0); return Number.isFinite(n) ? n : 0; }
function platformForAsset(platform: string | null): PlatformKey {
  const normalized = (platform || "").toLowerCase();
  if (normalized.includes("youtube")) return "youtube";
  if (normalized.includes("instagram") || normalized === "ig") return "instagram";
  if (normalized.includes("tiktok")) return "tiktok";
  if (normalized.includes("facebook") || normalized === "fb") return "facebook";
  return "other";
}
function platformTitle(platform: PlatformKey) {
  return platform === "other" ? "Other Platforms" : platform[0].toUpperCase() + platform.slice(1);
}
function platformDescription(platform: PlatformKey) {
  if (platform === "youtube") return "Long-form teaching and YouTube Shorts";
  if (platform === "instagram") return "Reels, posts, carousels, and stories";
  if (platform === "tiktok") return "Short-form video";
  if (platform === "facebook") return "Posts, Reels, and stories";
  return "PDFs, email, articles, print, merch, and other channels";
}
function PlatformIcon({ platform }: { platform: PlatformKey }) {
  if (platform === "youtube") return <Youtube size={21}/>;
  if (platform === "instagram") return <Instagram size={21}/>;
  if (platform === "facebook") return <Facebook size={21}/>;
  if (platform === "tiktok") return <span className="platform-letter-icon">TT</span>;
  return <Globe2 size={21}/>;
}

export default async function PathwayPublishingDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ platform?: string }>;
}) {
  const permission = await getStudioPermission("view_content");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const canManage = permission.access.state === "unconfigured" || hasStudioPermission(permission.access.role, "manage_content");
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const requestedPlatform = String(query?.platform || "").toLowerCase();
  const selectedPlatform: PlatformKey = platformOrder.includes(requestedPlatform as PlatformKey) ? requestedPlatform as PlatformKey : "instagram";
  const defaultPublicationPlatform = selectedPlatform === "other" ? "instagram" : selectedPlatform;
  const defaultAssetType = selectedPlatform === "youtube" ? "youtube" : selectedPlatform === "other" ? "pdf" : "short_video";

  const [summary, automations, performance] = await Promise.all([
    getPathwayPublishingSummary(slug),
    listAvailableSocialAutomations(),
    listPathwayPublicationPerformance(slug)
  ]);
  if (!summary) notFound();

  const profile = summary.profile;
  const defaultKeyword = profile?.primary_keyword || "";
  const defaultDestination = websitePathwayUrl(summary.pathway.slug);
  const projectStatus = profile?.campaign_status || (summary.started ? "planning" : "not started");
  const platformStats = platformOrder.map((platform) => {
    const assets = summary.assets.filter((asset) => platformForAsset(asset.platform) === platform);
    const published = assets.filter((asset) => asset.status === "published").length;
    return { platform, assets, published, completion: assets.length ? Math.round((published / assets.length) * 100) : 0 };
  });

  return <>
    <div className="pathway-project-hero">
      <div>
        <Link href="/admin/pathways" className="admin-back-link"><ArrowLeft size={15}/> Back to projects</Link>
        <span className="eyebrow">Distribution project</span>
        <h1>{summary.pathway.title}</h1>
        <p className="admin-lede">{summary.pathway.summary}</p>
        <div className="pathway-source-meta">{summary.pathway.collection} · {summary.pathway.estimatedMinutes} min · {summary.pathway.keySteps} steps · {summary.pathway.level}</div>
        <div className="admin-inline-actions pathway-destination-actions">
          <a className="button button-outline" href={summary.websiteUrl} target="_blank" rel="noreferrer">Website Pathway <ExternalLink size={15}/></a>
          <a className="button button-outline" href={summary.appUrl} target="_blank" rel="noreferrer">App Pathway <ExternalLink size={15}/></a>
        </div>
      </div>
      <aside className="pathway-project-meta">
        <span className={projectStatus === "active" ? "status-pill status-pending" : "status-pill status-muted"}>{projectStatus}</span>
        <div><small>Primary keyword</small><strong>{defaultKeyword || "Not set"}</strong></div>
        <div><small>Meta automation</small><strong>{summary.socialAutomationName || "Not linked"}</strong></div>
      </aside>
    </div>

    <div className="studio-kpi-grid studio-kpi-grid-four pathway-project-kpis">
      <div className="studio-kpi"><FileText size={18}/><span>Total assets</span><strong>{summary.assets.length}</strong><small>Production items tracked</small></div>
      <div className="studio-kpi"><Globe2 size={18}/><span>Published</span><strong>{summary.publishedAssets}</strong><small>Assets marked live</small></div>
      <div className="studio-kpi"><RefreshCw size={18}/><span>Publishing progress</span><strong>{summary.completion}%</strong><small>Published ÷ total assets</small></div>
      <div className="studio-kpi"><Instagram size={18}/><span>Meta automation</span><strong>{summary.socialAutomationName ? "Linked" : "Not linked"}</strong><small>{summary.socialAutomationName ? "Keyword flow connected" : "Connect in campaign setup"}</small></div>
    </div>

    <nav className="pathway-project-tabs" aria-label="Project sections">
      <a href="#overview">Overview</a>
      <a href="#content-assets">Content</a>
      <a href="#publications">Publications</a>
      <a href="#campaign-setup">Campaign setup</a>
    </nav>

    <section className="pathway-overview-grid" id="overview">
      <div className="admin-card pathway-platform-card">
        <div className="studio-section-head"><div><span className="section-kicker">Content by platform</span><h2>Distribution package</h2></div><p>Pick a channel to add its next asset. Each channel keeps its own production count while the Pathway stays the common destination.</p></div>
        <div className="pathway-platform-list">
          {platformStats.map(({ platform, assets, published, completion }) => <div className="pathway-platform-row" key={platform}>
            <div className={`pathway-platform-icon ${platform}`}><PlatformIcon platform={platform}/></div>
            <div className="pathway-platform-copy"><strong>{platformTitle(platform)}</strong><small>{platformDescription(platform)}</small></div>
            <div className="pathway-platform-stat"><strong>{assets.length}</strong><span>Assets</span></div>
            <div className="pathway-platform-stat"><strong>{published}</strong><span>Live</span></div>
            <div className="pathway-platform-progress"><strong>{completion}%</strong><span>Published</span><i><b style={{ width: `${completion}%` }}/></i></div>
            <Link href={`?platform=${platform}#content-assets`} className="pathway-platform-open" aria-label={`Add ${platformTitle(platform)} content`}><ArrowRight size={18}/></Link>
          </div>)}
        </div>
      </div>

      <aside className="pathway-overview-side">
        <section className="admin-card pathway-performance-summary">
          <div className="studio-section-head"><div><span className="section-kicker">Cross-platform performance</span><h2>Campaign reach</h2></div></div>
          <div className="pathway-performance-grid">
            <div><strong>{compact(performance.totals.views)}</strong><span>Views</span></div>
            <div><strong>{compact(performance.totals.likes)}</strong><span>Likes</span></div>
            <div><strong>{compact(performance.totals.comments)}</strong><span>Comments</span></div>
            <div><strong>{compact(performance.totals.shares)}</strong><span>Shares</span></div>
          </div>
          {!performance.publications.length ? <p className="pathway-empty-copy">No performance data yet. Attach a published post after it goes live.</p> : null}
        </section>
        <section className="admin-card pathway-quick-actions">
          <span className="section-kicker">Next actions</span>
          <Link href={`?platform=${selectedPlatform}#content-assets`}><Plus size={16}/><span><strong>Add {platformTitle(selectedPlatform)} content</strong><small>Create the next production asset</small></span></Link>
          <a href="#publications"><ExternalLink size={16}/><span><strong>Attach a live post</strong><small>Connect the platform post and sync stats</small></span></a>
          <a href="#campaign-setup"><MessageCircle size={16}/><span><strong>Configure CTA messaging</strong><small>Keyword, app handoff, and Meta flow</small></span></a>
        </section>
      </aside>
    </section>

    {canManage ? <section className="admin-card publishing-card pathway-content-section" id="content-assets">
      <div className="studio-section-head"><div><span className="section-kicker">Production · {platformTitle(selectedPlatform)}</span><h2>Add a content asset</h2></div><p>An asset is the piece you are making: a video, Reel, carousel, PDF, email, thumbnail, script, or print file. Publishing it later creates a separate publication record.</p></div>
      <form action={createPathwayAsset} className="social-fields pathway-asset-form">
        <input type="hidden" name="pathway_slug" value={summary.pathway.slug}/>
        <div className="form-row">
          <label>Primary channel<select name="platform" defaultValue={selectedPlatform}>{platformOrder.map((platform) => <option value={platform} key={platform}>{platformTitle(platform)}</option>)}</select></label>
          <label>Asset type<select name="type" defaultValue={defaultAssetType}>{assetTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label>
        </div>
        <div className="form-row">
          <label>Title<input name="title" required placeholder="The Word Was God"/></label>
          <label>Status<select name="status" defaultValue="idea">{assetStatuses.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label>
        </div>
        <div className="form-row">
          <label>Source / editable URL<input name="source_url" type="url" placeholder="Canva, Drive, Figma, script doc…"/></label>
          <label>Final file URL<input name="file_url" type="url" placeholder="Final export or deliverable"/></label>
        </div>
        <label>Hook<textarea name="hook" placeholder="What stops the scroll or opens the teaching?"/></label>
        <label>Caption / description<textarea name="caption" placeholder="Platform-ready copy"/></label>
        <div className="form-row">
          <label>CTA<select name="cta_type" defaultValue={defaultKeyword ? "comment_keyword" : "visit_pathway"}>{ctaTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label>
          <label>CTA keyword<input name="cta_keyword" defaultValue={defaultKeyword} placeholder="JESUS"/></label>
        </div>
        <label>Destination URL<input name="destination_url" type="url" defaultValue={defaultDestination}/></label>
        <div className="form-row">
          <label>Language<input name="language" defaultValue="en"/></label>
          <label>Sort order<input name="sort_order" type="number" defaultValue="0"/></label>
        </div>
        <label>Production notes<textarea name="asset_notes" placeholder="Edit notes, thumbnail idea, shot list, dependencies…"/></label>
        <div className="broadcast-actions"><button className="button button-crimson" type="submit"><Plus size={16}/> Add {platformTitle(selectedPlatform)} asset</button></div>
      </form>
    </section> : null}

    <section className="admin-card publishing-card pathway-asset-library-card">
      <div className="studio-section-head"><div><span className="section-kicker">Asset library</span><h2>Content in this project</h2></div><p>Assets stay grouped by their primary channel. Open an item to update its production state, links, copy, and CTA.</p></div>
      {summary.assets.length ? <div className="pathway-asset-groups">{platformStats.filter((group) => group.assets.length).map((group) => <section className="pathway-asset-group" key={group.platform}>
        <div className="pathway-asset-group-head"><div className={`pathway-platform-icon ${group.platform}`}><PlatformIcon platform={group.platform}/></div><div><strong>{platformTitle(group.platform)}</strong><small>{group.assets.length} asset{group.assets.length === 1 ? "" : "s"} · {group.published} live</small></div></div>
        <div className="social-automation-list">{group.assets.map((asset) => <details className="social-connection-details pathway-asset-details" key={asset.id}>
          <summary><span><strong>{asset.title}</strong><small>{label(asset.type)} · {label(asset.status)}</small></span></summary>
          {canManage ? <form action={updatePathwayAsset} className="social-fields">
            <input type="hidden" name="id" value={asset.id}/><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/>
            <div className="form-row"><label>Primary channel<select name="platform" defaultValue={platformForAsset(asset.platform)}>{platformOrder.map((platform) => <option value={platform} key={platform}>{platformTitle(platform)}</option>)}</select></label><label>Type<select name="type" defaultValue={asset.type}>{assetTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label></div>
            <div className="form-row"><label>Title<input name="title" defaultValue={asset.title} required/></label><label>Status<select name="status" defaultValue={asset.status}>{assetStatuses.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label></div>
            <div className="form-row"><label>Source / editable URL<input name="source_url" type="url" defaultValue={asset.source_url || ""}/></label><label>Final file URL<input name="file_url" type="url" defaultValue={asset.file_url || ""}/></label></div>
            <label>Hook<textarea name="hook" defaultValue={asset.hook || ""}/></label><label>Caption / description<textarea name="caption" defaultValue={asset.caption || ""}/></label>
            <div className="form-row"><label>CTA<select name="cta_type" defaultValue={asset.cta_type}>{ctaTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label><label>CTA keyword<input name="cta_keyword" defaultValue={asset.cta_keyword || defaultKeyword}/></label></div>
            <label>Destination URL<input name="destination_url" type="url" defaultValue={asset.destination_url || defaultDestination}/></label>
            <div className="form-row"><label>Language<input name="language" defaultValue={asset.language}/></label><label>Sort order<input name="sort_order" type="number" defaultValue={asset.sort_order}/></label></div>
            <label>Production notes<textarea name="asset_notes" defaultValue={asset.notes || ""}/></label>
            <input type="hidden" name="published_at" value={asset.published_at || ""}/>
            <div className="broadcast-actions"><button className="button button-crimson" type="submit">Save asset</button></div>
          </form> : <div className="role-readonly-note"><p>{asset.caption || asset.hook || asset.notes || "No notes."}</p></div>}
          {canManage ? <form action={archivePathwayAsset} className="pathway-archive-form"><input type="hidden" name="id" value={asset.id}/><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><button className="button button-outline" type="submit"><Trash2 size={15}/> Archive asset</button></form> : null}
        </details>)}</div>
      </section>)}</div> : <div className="empty-state"><Plus size={22}/><strong>No content assets yet.</strong><p>Choose a platform above and create the first piece in this distribution project.</p></div>}
    </section>

    <section className="admin-card publishing-card" id="publications">
      <div className="studio-section-head"><div><span className="section-kicker">Publications</span><h2>Live posts and metrics</h2></div><p>A publication is a real post that is already live on a platform. Attach it to an asset so Studio can collect platform statistics.</p></div>
      {performance.publications.length ? <div className="content-library">{performance.publications.map((publication) => {
        const metrics = publication.metrics as Record<string, unknown> | null;
        const syncStatus = String(metrics?.sync_status || "not synced");
        return <div className="content-library-row pathway-publication-row" key={String(publication.id)}>
          <div><span className="content-kind">{String(publication.platform)}</span><strong>{summary.assets.find((asset) => asset.id === publication.asset_id)?.title || "Unlinked publication"}</strong><small>{compact(metric(metrics, "views"))} views · {compact(metric(metrics, "likes"))} likes · {compact(metric(metrics, "comments"))} comments · {compact(metric(metrics, "shares"))} shares · {syncStatus}</small>{metrics?.error_message ? <small className="pathway-sync-error">{String(metrics.error_message)}</small> : null}</div>
          <div className="content-row-end">{publication.published_url ? <a className="button button-outline" href={String(publication.published_url)} target="_blank" rel="noreferrer">Open</a> : null}{canManage ? <form action={syncPathwayPublicationMetrics}><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><input type="hidden" name="publication_id" value={String(publication.id)}/><button className="button button-outline" type="submit"><RefreshCw size={14}/> Sync</button></form> : null}{canManage ? <form action={deletePathwayPublication}><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><input type="hidden" name="publication_id" value={String(publication.id)}/><button className="button button-outline" type="submit" aria-label="Remove publication"><Trash2 size={14}/></button></form> : null}</div>
        </div>;
      })}</div> : <div className="empty-state"><Globe2 size={22}/><strong>No live publications attached yet.</strong><p>Make the content first. Once it is posted, attach that platform post below.</p></div>}
      {canManage ? <details className="social-connection-details pathway-attach-publication"><summary><strong>Attach a published post</strong><small>Instagram, TikTok, YouTube, or Facebook</small></summary><form action={createPathwayPublication} className="social-fields"><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><div className="form-row"><label>Platform<select name="platform" defaultValue={defaultPublicationPlatform}>{publicationPlatforms.map((value) => <option key={value} value={value}>{platformTitle(value as PlatformKey)}</option>)}</select></label><label>Content asset<select name="asset_id" defaultValue=""><option value="">No linked asset</option>{summary.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label></div><label>Platform post / video ID<input name="external_post_id" required placeholder="Media ID or video ID"/><small>Use the platform's post/video ID. Studio needs this to request its metrics.</small></label><label>Published URL<input name="published_url" type="url" placeholder="https://…"/></label><label>Published at<input name="published_at" type="datetime-local"/></label><div className="broadcast-actions"><button className="button button-crimson" type="submit">Attach & sync metrics</button></div></form></details> : null}
    </section>

    <section className="admin-card publishing-card" id="campaign-setup">
      <div className="studio-section-head"><div><span className="section-kicker">Campaign setup</span><h2>Messaging and handoff</h2></div><p>This is where the post CTA connects back to the Pathway. Set the keyword, app destination, campaign state, and existing Instagram automation.</p></div>
      {canManage ? <form action={savePathwayProfile} className="social-fields">
        <input type="hidden" name="pathway_slug" value={summary.pathway.slug}/>
        <div className="form-row"><label>Campaign status<select name="campaign_status" defaultValue={profile?.campaign_status || "planning"}>{campaignStatuses.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label><label>Primary comment keyword<input name="primary_keyword" defaultValue={defaultKeyword} placeholder="JESUS"/></label></div>
        <label>App Pathway URL<input name="app_url" type="url" defaultValue={summary.appUrl}/><small>The public website Pathway remains fixed. Override the app destination here only if the app uses a different path.</small></label>
        <label>Instagram automation<select name="social_automation_id" defaultValue={profile?.social_automation_id || ""}><option value="">No automation linked</option>{automations.map((automation) => <option value={automation.id} key={automation.id}>{automation.enabled ? "●" : "○"} {automation.name} · {automation.keywords.join(", ")}</option>)}</select><small>The response copy and actual DM flow remain managed under Distribution → Social automations.</small></label>
        <label>Campaign notes<textarea name="notes" defaultValue={profile?.notes || ""} placeholder="Launch plan, next recording, campaign decision, dependency…"/></label>
        <div className="broadcast-actions"><Link className="button button-outline" href="/admin/social">Open Social Automations</Link><button className="button button-crimson" type="submit">Save campaign setup</button></div>
      </form> : <div className="role-readonly-note"><strong>Read-only access</strong><p>Your role can review this project but cannot edit its campaign setup.</p></div>}
    </section>
  </>;
}

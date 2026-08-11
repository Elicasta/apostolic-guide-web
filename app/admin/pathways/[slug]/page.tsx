import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, Facebook, FileText, Globe2, Instagram, MessageCircle, Plus, RefreshCw, Settings2, Trash2, Youtube } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { getPathwayPublishingSummary, listAvailableSocialAutomations, websitePathwayUrl } from "@/pathway-publishing";
import { listPathwayPublicationPerformance } from "@/publication-metrics";
import { archivePathwayAsset, createPathwayAsset, createPathwayPublication, deletePathwayPublication, savePathwayProfile, syncPathwayPublicationMetrics, updatePathwayAsset } from "../actions";

const assetTypes = ["youtube","short_video","carousel","graphic","story","pdf","email","article","thumbnail","script","print","merch","other"];
const assetStatuses = ["idea","script","ready_to_produce","in_production","ready_to_publish","published","blocked"];
const ctaTypes = ["none","comment_keyword","visit_pathway","download_pdf","watch_youtube","open_app"];
const campaignStatuses = ["planning","active","paused","complete","archived"];
const publicationPlatforms = ["instagram","tiktok","youtube","facebook"];
const platformOrder = ["youtube","instagram","tiktok","facebook","other"] as const;

function label(value: string) { return value.replaceAll("_", " "); }
function compact(value: number | null | undefined) { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0); }
function metric(row: Record<string, unknown> | null | undefined, key: string) { const n = Number(row?.[key] ?? 0); return Number.isFinite(n) ? n : 0; }
function platformForAsset(platform: string | null) {
  const normalized = (platform || "").toLowerCase();
  if (normalized.includes("youtube")) return "youtube";
  if (normalized.includes("instagram") || normalized === "ig") return "instagram";
  if (normalized.includes("tiktok")) return "tiktok";
  if (normalized.includes("facebook") || normalized === "fb") return "facebook";
  return "other";
}
function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "youtube") return <Youtube size={22}/>;
  if (platform === "instagram") return <Instagram size={22}/>;
  if (platform === "facebook") return <Facebook size={22}/>;
  if (platform === "tiktok") return <span className="platform-letter-icon">TT</span>;
  return <Globe2 size={22}/>;
}

export default async function PathwayPublishingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const permission = await getStudioPermission("view_content");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const canManage = permission.access.state === "unconfigured" || hasStudioPermission(permission.access.role, "manage_content");
  const { slug } = await params;
  const [summary, automations, performance] = await Promise.all([
    getPathwayPublishingSummary(slug),
    listAvailableSocialAutomations(),
    listPathwayPublicationPerformance(slug)
  ]);
  if (!summary) notFound();

  const profile = summary.profile;
  const defaultKeyword = profile?.primary_keyword || "";
  const defaultDestination = websitePathwayUrl(summary.pathway.slug);
  const platformStats = platformOrder.map((platform) => {
    const assets = summary.assets.filter((asset) => platformForAsset(asset.platform) === platform);
    const published = assets.filter((asset) => asset.status === "published").length;
    return { platform, assets, published, completion: assets.length ? Math.round((published / assets.length) * 100) : 0 };
  });

  return <>
    <div className="pathway-project-hero">
      <div>
        <Link href="/admin/pathways" className="admin-back-link"><ArrowLeft size={15}/> Back to Pathways</Link>
        <span className="eyebrow">Pathway campaign</span>
        <h1>{summary.pathway.title}</h1>
        <p className="admin-lede">{summary.pathway.summary}</p>
        <div className="admin-inline-actions pathway-destination-actions">
          <a className="button button-outline" href={summary.websiteUrl} target="_blank" rel="noreferrer">Website <ExternalLink size={15}/></a>
          <a className="button button-outline" href={summary.appUrl} target="_blank" rel="noreferrer">App <ExternalLink size={15}/></a>
        </div>
      </div>
      <aside className="pathway-project-meta">
        <span className="status-pill">{profile?.campaign_status || "planning"}</span>
        <small>Primary keyword</small>
        <strong>{defaultKeyword || "Not set"}</strong>
        <span>{summary.socialAutomationName ? `Meta: ${summary.socialAutomationName}` : "Meta automation not linked"}</span>
      </aside>
    </div>

    <div className="studio-kpi-grid studio-kpi-grid-four pathway-project-kpis">
      <div className="studio-kpi"><FileText size={18}/><span>Total assets</span><strong>{summary.assets.length}</strong><small>Across all platforms</small></div>
      <div className="studio-kpi"><Globe2 size={18}/><span>Published</span><strong>{summary.publishedAssets}</strong><small>Assets live</small></div>
      <div className="studio-kpi"><RefreshCw size={18}/><span>Asset completion</span><strong>{summary.completion}%</strong><small>Overall progress</small></div>
      <div className="studio-kpi"><Instagram size={18}/><span>Meta automation</span><strong>{summary.socialAutomationName ? "Linked" : "Not linked"}</strong><small>{summary.socialAutomationName ? "Keyword flow ready" : "Connect automation"}</small></div>
    </div>

    <nav className="pathway-project-tabs" aria-label="Project sections">
      <a href="#overview">Overview</a><a href="#content-assets">Content Assets</a><a href="#publications">Publications</a><a href="#performance">Performance</a><a href="#messaging">Messaging</a><a href="#settings">Settings</a>
    </nav>

    <section className="pathway-overview-grid" id="overview">
      <div className="admin-card pathway-platform-card" id="content-assets">
        <div className="studio-section-head"><div><span className="section-kicker">Content by platform</span><h2>Distribution package</h2></div><p>Create once around the Pathway, then manage each platform separately.</p></div>
        <div className="pathway-platform-list">
          {platformStats.map(({ platform, assets, published, completion }) => <div className="pathway-platform-row" key={platform}>
            <div className={`pathway-platform-icon ${platform}`}><PlatformIcon platform={platform}/></div>
            <div className="pathway-platform-copy"><strong>{platform === "other" ? "Other Platforms" : platform[0].toUpperCase()+platform.slice(1)}</strong><small>{platform === "youtube" ? "Long form videos and YouTube Shorts" : platform === "instagram" ? "Reels, posts, carousels and stories" : platform === "tiktok" ? "Short form videos" : platform === "facebook" ? "Posts, Reels and stories" : "PDFs, email, articles, print and other channels"}</small></div>
            <div className="pathway-platform-stat"><strong>{assets.length}</strong><span>Assets</span></div>
            <div className="pathway-platform-stat"><strong>{published}</strong><span>Published</span></div>
            <div className="pathway-platform-progress"><strong>{completion}%</strong><span>Completion</span><i><b style={{ width: `${completion}%` }}/></i></div>
            <a href="#add-asset" className="pathway-platform-open" aria-label={`Add ${platform} content`}><ArrowRight size={18}/></a>
          </div>)}
        </div>
      </div>

      <aside className="pathway-overview-side">
        <section className="admin-card pathway-performance-summary" id="performance">
          <div className="studio-section-head"><div><span className="section-kicker">Cross-platform performance</span><h2>Campaign reach</h2></div></div>
          <div className="pathway-performance-grid">
            <div><strong>{compact(performance.totals.views)}</strong><span>Views</span></div>
            <div><strong>{compact(performance.totals.likes)}</strong><span>Likes</span></div>
            <div><strong>{compact(performance.totals.comments)}</strong><span>Comments</span></div>
            <div><strong>{compact(performance.totals.shares)}</strong><span>Shares</span></div>
          </div>
          {!performance.publications.length ? <p className="pathway-empty-copy">No performance data yet. Attach a published post to start tracking.</p> : null}
        </section>
        <section className="admin-card pathway-quick-actions">
          <span className="section-kicker">Quick actions</span>
          <a href="#add-asset"><Plus size={16}/><span><strong>Add content asset</strong><small>Upload or link a new asset</small></span></a>
          <a href="#publications"><ExternalLink size={16}/><span><strong>Attach published post</strong><small>Connect a public post</small></span></a>
          <a href="#messaging"><MessageCircle size={16}/><span><strong>Manage messaging</strong><small>Edit keyword automation</small></span></a>
          <a href="#publications"><Globe2 size={16}/><span><strong>View all publications</strong><small>See every published post</small></span></a>
        </section>
      </aside>
    </section>

    <section className="admin-card publishing-card" id="publications">
      <div className="studio-section-head"><div><span className="section-kicker">Publications</span><h2>Published posts and live metrics</h2></div><p>One content asset can have a separate publication on Instagram, TikTok, YouTube, Facebook, or another platform.</p></div>
      {performance.publications.length ? <div className="content-library">{performance.publications.map((publication) => {
        const metrics = publication.metrics as Record<string, unknown> | null;
        const syncStatus = String(metrics?.sync_status || "not synced");
        return <div className="content-library-row" key={String(publication.id)}>
          <div><span className="content-kind">{String(publication.platform)}</span><strong>{summary.assets.find((asset) => asset.id === publication.asset_id)?.title || "Published asset"}</strong><small>{compact(metric(metrics, "views"))} views · {compact(metric(metrics, "likes"))} likes · {compact(metric(metrics, "comments"))} comments · {compact(metric(metrics, "shares"))} shares · {syncStatus}</small>{metrics?.error_message ? <small>{String(metrics.error_message)}</small> : null}</div>
          <div className="content-row-end">{publication.published_url ? <a className="button button-outline" href={String(publication.published_url)} target="_blank" rel="noreferrer">Open</a> : null}{canManage ? <form action={syncPathwayPublicationMetrics}><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><input type="hidden" name="publication_id" value={String(publication.id)}/><button className="button button-outline" type="submit"><RefreshCw size={14}/> Sync</button></form> : null}{canManage ? <form action={deletePathwayPublication}><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><input type="hidden" name="publication_id" value={String(publication.id)}/><button className="button button-outline" type="submit"><Trash2 size={14}/></button></form> : null}</div>
        </div>;
      })}</div> : <div className="empty-state"><strong>No platform publications tracked yet.</strong><p>Attach an Instagram, TikTok, YouTube, or Facebook post below. Studio will keep metric snapshots against that publication.</p></div>}
      {canManage ? <details className="social-connection-details pathway-attach-publication"><summary><strong>+ Attach a published post</strong></summary><form action={createPathwayPublication} className="social-fields"><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><div className="form-row"><label>Platform<select name="platform" defaultValue="instagram">{publicationPlatforms.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Content asset<select name="asset_id" defaultValue=""><option value="">No linked asset</option>{summary.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label></div><label>Platform post / video ID<input name="external_post_id" required placeholder="Instagram media ID, TikTok video ID, or YouTube video ID"/></label><label>Published URL<input name="published_url" type="url" placeholder="https://..."/></label><label>Published at<input name="published_at" type="datetime-local"/></label><div className="broadcast-actions"><button className="button button-crimson" type="submit">Attach & sync metrics</button></div></form></details> : null}
    </section>

    <section className="admin-card publishing-card" id="messaging">
      <div className="studio-section-head"><div><span className="section-kicker">Messaging</span><h2>Pathway distribution settings</h2></div><p>Set the comment keyword and connect it to the Instagram automation already managed by Studio.</p></div>
      {canManage ? <form action={savePathwayProfile} className="social-fields"><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><div className="form-row"><label>Campaign status<select name="campaign_status" defaultValue={profile?.campaign_status || "planning"}>{campaignStatuses.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label><label>Primary comment keyword<input name="primary_keyword" defaultValue={defaultKeyword} placeholder="JESUS"/></label></div><label>App Pathway URL<input name="app_url" type="url" defaultValue={summary.appUrl}/></label><label>Instagram automation<select name="social_automation_id" defaultValue={profile?.social_automation_id || ""}><option value="">No automation linked</option>{automations.map((automation) => <option value={automation.id} key={automation.id}>{automation.enabled ? "●" : "○"} {automation.name} · {automation.keywords.join(", ")}</option>)}</select><small>Create and edit the actual keyword response under Distribution → Social automations.</small></label><label>Campaign notes<textarea name="notes" defaultValue={profile?.notes || ""} placeholder="Launch plan, production notes, next action..."/></label><div className="broadcast-actions"><Link className="button button-outline" href="/admin/social">Open Social Automations</Link><button className="button button-crimson" type="submit">Save campaign setup</button></div></form> : <div className="role-readonly-note"><strong>Read-only access</strong><p>Your role can review this Pathway campaign but cannot edit it.</p></div>}
    </section>

    {canManage ? <section className="admin-card publishing-card" id="add-asset"><div className="studio-section-head"><div><span className="section-kicker">Production</span><h2>Add a content asset</h2></div><p>Add the actual piece of content first. Once it is published, attach the platform post above so stats can sync.</p></div><form action={createPathwayAsset} className="social-fields"><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><div className="form-row"><label>Asset type<select name="type" defaultValue="short_video">{assetTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label><label>Status<select name="status" defaultValue="idea">{assetStatuses.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label></div><label>Title<input name="title" required placeholder="The Word Was God"/></label><div className="form-row"><label>Language<input name="language" defaultValue="en"/></label><label>Platform<select name="platform" defaultValue="instagram"><option value="youtube">YouTube</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="facebook">Facebook</option><option value="other">Other</option></select></label></div><div className="form-row"><label>Source / editable URL<input name="source_url" type="url" placeholder="Canva, Drive, Figma..."/></label><label>Final file URL<input name="file_url" type="url"/></label></div><label>Published URL<input name="published_url" type="url"/></label><label>Hook<textarea name="hook"/></label><label>Caption<textarea name="caption"/></label><div className="form-row"><label>CTA<select name="cta_type" defaultValue={defaultKeyword ? "comment_keyword" : "visit_pathway"}>{ctaTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label><label>CTA keyword<input name="cta_keyword" defaultValue={defaultKeyword}/></label></div><label>Destination URL<input name="destination_url" type="url" defaultValue={defaultDestination}/></label><label>Production notes<textarea name="asset_notes"/></label><input type="hidden" name="sort_order" value="0"/><div className="broadcast-actions"><button className="button button-crimson" type="submit"><Plus size={16}/> Add asset</button></div></form></section> : null}

    <section className="admin-card publishing-card" id="settings">
      <div className="studio-section-head"><div><span className="section-kicker">Asset library</span><h2>All project content</h2></div><p>{summary.assets.length ? "Open any asset to update the source, copy, CTA, platform, and publication state." : "Nothing tracked yet. Add the first asset above."}</p></div>
      {summary.assets.length ? <div className="social-automation-list">{summary.assets.map((asset) => <details className="social-connection-details" key={asset.id}><summary><span><strong>{asset.title}</strong> · {asset.platform || "other"} · {label(asset.type)} · {label(asset.status)}</span></summary>{canManage ? <form action={updatePathwayAsset} className="social-fields"><input type="hidden" name="id" value={asset.id}/><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><div className="form-row"><label>Type<select name="type" defaultValue={asset.type}>{assetTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label><label>Status<select name="status" defaultValue={asset.status}>{assetStatuses.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label></div><label>Title<input name="title" defaultValue={asset.title} required/></label><div className="form-row"><label>Language<input name="language" defaultValue={asset.language}/></label><label>Platform<select name="platform" defaultValue={platformForAsset(asset.platform)}><option value="youtube">YouTube</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="facebook">Facebook</option><option value="other">Other</option></select></label></div><div className="form-row"><label>Source / editable URL<input name="source_url" type="url" defaultValue={asset.source_url || ""}/></label><label>Final file URL<input name="file_url" type="url" defaultValue={asset.file_url || ""}/></label></div><label>Published URL<input name="published_url" type="url" defaultValue={asset.published_url || ""}/></label><label>Hook<textarea name="hook" defaultValue={asset.hook || ""}/></label><label>Caption<textarea name="caption" defaultValue={asset.caption || ""}/></label><div className="form-row"><label>CTA<select name="cta_type" defaultValue={asset.cta_type}>{ctaTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label><label>CTA keyword<input name="cta_keyword" defaultValue={asset.cta_keyword || defaultKeyword}/></label></div><label>Destination URL<input name="destination_url" type="url" defaultValue={asset.destination_url || defaultDestination}/></label><label>Production notes<textarea name="asset_notes" defaultValue={asset.notes || ""}/></label><input type="hidden" name="sort_order" value={asset.sort_order}/><input type="hidden" name="published_at" value={asset.published_at || ""}/><div className="broadcast-actions"><button className="button button-crimson" type="submit">Save asset</button></div></form> : <div className="role-readonly-note"><p>{asset.caption || asset.hook || asset.notes || "No notes."}</p></div>}{canManage ? <form action={archivePathwayAsset}><input type="hidden" name="id" value={asset.id}/><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><button className="button button-outline" type="submit"><Trash2 size={15}/> Archive asset</button></form> : null}</details>)}</div> : <div className="empty-state"><Plus size={24}/><strong>No campaign assets yet.</strong><p>Add the first asset above. The Pathway itself remains live and unchanged.</p></div>}
    </section>
  </>;
}

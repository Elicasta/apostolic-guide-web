import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Instagram, Plus, Trash2 } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { getPathwayPublishingSummary, listAvailableSocialAutomations, websitePathwayUrl } from "@/pathway-publishing";
import { archivePathwayAsset, createPathwayAsset, savePathwayProfile, updatePathwayAsset } from "../actions";

const assetTypes = ["youtube","short_video","carousel","graphic","story","pdf","email","article","thumbnail","script","print","merch","other"];
const assetStatuses = ["idea","script","ready_to_produce","in_production","ready_to_publish","published","blocked"];
const ctaTypes = ["none","comment_keyword","visit_pathway","download_pdf","watch_youtube","open_app"];
const campaignStatuses = ["planning","active","paused","complete","archived"];

function label(value: string) { return value.replaceAll("_", " "); }

export default async function PathwayPublishingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const permission = await getStudioPermission("view_content");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const canManage = permission.access.state === "unconfigured" || hasStudioPermission(permission.access.role, "manage_content");
  const { slug } = await params;
  const [summary, automations] = await Promise.all([getPathwayPublishingSummary(slug), listAvailableSocialAutomations()]);
  if (!summary) notFound();

  const profile = summary.profile;
  const defaultKeyword = profile?.primary_keyword || "";
  const defaultDestination = websitePathwayUrl(summary.pathway.slug);

  return <>
    <Link href="/admin/pathways" className="admin-back-link"><ArrowLeft size={15}/> Pathway control panel</Link>
    <span className="eyebrow">Pathway campaign</span>
    <div className="admin-page-heading">
      <div>
        <h1>{summary.pathway.title}</h1>
        <p className="admin-lede">{summary.pathway.summary}</p>
      </div>
      <div className="admin-inline-actions">
        <a className="button button-outline" href={summary.websiteUrl} target="_blank" rel="noreferrer">Website <ExternalLink size={15}/></a>
        <a className="button button-outline" href={summary.appUrl} target="_blank" rel="noreferrer">App <ExternalLink size={15}/></a>
      </div>
    </div>

    <div className="publishing-metrics">
      <div><strong>{summary.assets.length}</strong><span>Total assets</span></div>
      <div><strong>{summary.publishedAssets}</strong><span>Published</span></div>
      <div><strong>{summary.completion}%</strong><span>Asset completion</span></div>
      <div><Instagram size={18}/><strong>{summary.socialAutomationName ? "Linked" : "Not linked"}</strong><span>Meta automation</span></div>
    </div>

    <section className="admin-card publishing-card">
      <div className="card-heading"><div><span className="section-kicker">Campaign setup</span><h2>Pathway distribution</h2></div><p>Set the primary comment keyword, app destination, and connect this Pathway to the Instagram automation you already manage in Studio.</p></div>
      {canManage ? <form action={savePathwayProfile} className="social-fields">
        <input type="hidden" name="pathway_slug" value={summary.pathway.slug}/>
        <div className="form-row">
          <label>Campaign status<select name="campaign_status" defaultValue={profile?.campaign_status || "planning"}>{campaignStatuses.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label>
          <label>Primary comment keyword<input name="primary_keyword" defaultValue={defaultKeyword} placeholder="JESUS"/></label>
        </div>
        <label>App Pathway URL<input name="app_url" type="url" defaultValue={summary.appUrl}/></label>
        <label>Instagram automation<select name="social_automation_id" defaultValue={profile?.social_automation_id || ""}><option value="">No automation linked</option>{automations.map((automation) => <option value={automation.id} key={automation.id}>{automation.enabled ? "●" : "○"} {automation.name} · {automation.keywords.join(", ")}</option>)}</select><small>Create and edit the actual keyword response under Distribution → Social automations.</small></label>
        <label>Campaign notes<textarea name="notes" defaultValue={profile?.notes || ""} placeholder="Launch plan, production notes, next action..."/></label>
        <div className="broadcast-actions"><Link className="button button-outline" href="/admin/social">Open Social Automations</Link><button className="button button-crimson" type="submit">Save campaign setup</button></div>
      </form> : <div className="role-readonly-note"><strong>Read-only access</strong><p>Your role can review this Pathway campaign but cannot edit it.</p></div>}
    </section>

    {canManage ? <section className="admin-card publishing-card">
      <div className="card-heading"><div><span className="section-kicker">Production</span><h2>Add an asset</h2></div><p>One record represents the content itself. The source file, final file, caption, CTA, and published link stay together.</p></div>
      <form action={createPathwayAsset} className="social-fields">
        <input type="hidden" name="pathway_slug" value={summary.pathway.slug}/>
        <div className="form-row">
          <label>Asset type<select name="type" defaultValue="short_video">{assetTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label>
          <label>Status<select name="status" defaultValue="idea">{assetStatuses.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label>
        </div>
        <label>Title<input name="title" required placeholder="The Word Was God"/></label>
        <div className="form-row"><label>Language<input name="language" defaultValue="en"/></label><label>Platform<input name="platform" placeholder="instagram, youtube, multi..."/></label></div>
        <div className="form-row"><label>Source / editable URL<input name="source_url" type="url" placeholder="Canva, Drive, Figma..."/></label><label>Final file URL<input name="file_url" type="url"/></label></div>
        <label>Published URL<input name="published_url" type="url"/></label>
        <label>Hook<textarea name="hook"/></label>
        <label>Caption<textarea name="caption"/></label>
        <div className="form-row"><label>CTA<select name="cta_type" defaultValue={defaultKeyword ? "comment_keyword" : "visit_pathway"}>{ctaTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label><label>CTA keyword<input name="cta_keyword" defaultValue={defaultKeyword}/></label></div>
        <label>Destination URL<input name="destination_url" type="url" defaultValue={defaultDestination}/></label>
        <label>Production notes<textarea name="asset_notes"/></label>
        <input type="hidden" name="sort_order" value="0"/>
        <div className="broadcast-actions"><button className="button button-crimson" type="submit"><Plus size={16}/> Add asset</button></div>
      </form>
    </section> : null}

    <section className="admin-card publishing-card">
      <div className="card-heading"><div><span className="section-kicker">Asset library</span><h2>{summary.pathway.title} content</h2></div><p>{summary.assets.length ? "Open any asset to update its source, copy, CTA, and publication state." : "Nothing tracked yet. Add the first YouTube episode, Reel, carousel, PDF, or other campaign asset above."}</p></div>
      {summary.assets.length ? <div className="social-automation-list">{summary.assets.map((asset) => <details className="social-connection-details" key={asset.id}>
        <summary><span><strong>{asset.title}</strong> · {label(asset.type)} · {label(asset.status)}</span></summary>
        {canManage ? <form action={updatePathwayAsset} className="social-fields">
          <input type="hidden" name="id" value={asset.id}/><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/>
          <div className="form-row"><label>Type<select name="type" defaultValue={asset.type}>{assetTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label><label>Status<select name="status" defaultValue={asset.status}>{assetStatuses.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label></div>
          <label>Title<input name="title" defaultValue={asset.title} required/></label>
          <div className="form-row"><label>Language<input name="language" defaultValue={asset.language}/></label><label>Platform<input name="platform" defaultValue={asset.platform || ""}/></label></div>
          <div className="form-row"><label>Source / editable URL<input name="source_url" type="url" defaultValue={asset.source_url || ""}/></label><label>Final file URL<input name="file_url" type="url" defaultValue={asset.file_url || ""}/></label></div>
          <label>Published URL<input name="published_url" type="url" defaultValue={asset.published_url || ""}/></label>
          <label>Hook<textarea name="hook" defaultValue={asset.hook || ""}/></label><label>Caption<textarea name="caption" defaultValue={asset.caption || ""}/></label>
          <div className="form-row"><label>CTA<select name="cta_type" defaultValue={asset.cta_type}>{ctaTypes.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label><label>CTA keyword<input name="cta_keyword" defaultValue={asset.cta_keyword || defaultKeyword}/></label></div>
          <label>Destination URL<input name="destination_url" type="url" defaultValue={asset.destination_url || defaultDestination}/></label>
          <label>Production notes<textarea name="asset_notes" defaultValue={asset.notes || ""}/></label>
          <input type="hidden" name="sort_order" value={asset.sort_order}/><input type="hidden" name="published_at" value={asset.published_at || ""}/>
          <div className="broadcast-actions"><button className="button button-crimson" type="submit">Save asset</button></div>
        </form> : <div className="role-readonly-note"><p>{asset.caption || asset.hook || asset.notes || "No notes."}</p></div>}
        {canManage ? <form action={archivePathwayAsset}><input type="hidden" name="id" value={asset.id}/><input type="hidden" name="pathway_slug" value={summary.pathway.slug}/><button className="button button-outline" type="submit"><Trash2 size={15}/> Archive asset</button></form> : null}
      </details>)}</div> : <div className="empty-state"><Plus size={24}/><strong>No campaign assets yet.</strong><p>Add the first asset above. The Pathway itself remains live and unchanged.</p></div>}
    </section>
  </>;
}

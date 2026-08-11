import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, CircleDashed, ExternalLink, Plus, Route, Send } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { listPathwayPublishingSummaries } from "@/pathway-publishing";

export default async function PathwayPublishingPage() {
  const permission = await getStudioPermission("view_content");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const summaries = await listPathwayPublishingSummaries();
  const active = summaries.filter((item) => item.profile?.campaign_status === "active").length;
  const withAssets = summaries.filter((item) => item.assets.length > 0).length;
  const completed = summaries.filter((item) => item.profile?.campaign_status === "complete").length;
  const withAutomation = summaries.filter((item) => item.profile?.social_automation_id).length;

  return <>
    <div className="studio-page-heading pathway-library-heading">
      <div>
        <span className="eyebrow">Pathway publishing</span>
        <h1>Projects</h1>
        <p className="admin-lede">Each project is one existing Apostolic Guide Pathway. Build the YouTube, Instagram, TikTok, Facebook, downloads, messaging, and published links around that Pathway from one place.</p>
      </div>
      <a className="button button-crimson pathway-new-project-button" href="#new-project"><Plus size={16}/> New Project</a>
    </div>

    <div className="studio-kpi-grid studio-kpi-grid-four pathway-library-kpis">
      <div className="studio-kpi"><Route size={18}/><span>Live pathways</span><strong>{summaries.length}</strong><small>Available projects</small></div>
      <div className="studio-kpi"><CircleDashed size={18}/><span>Active campaigns</span><strong>{active}</strong><small>Currently distributing</small></div>
      <div className="studio-kpi"><CheckCircle2 size={18}/><span>With assets</span><strong>{withAssets}</strong><small>Production started</small></div>
      <div className="studio-kpi"><Send size={18}/><span>Meta flows linked</span><strong>{withAutomation}</strong><small>Keyword messaging connected</small></div>
    </div>

    <section className="admin-card studio-list-card pathway-project-list">
      <div className="studio-section-head">
        <div><span className="section-kicker">Library</span><h2>Current Pathway projects</h2></div>
        <p>{completed} complete. Open a project to manage content by platform, attach live posts, sync performance, and configure messaging.</p>
      </div>
      <div className="content-library">
        {summaries.map((item) => {
          const status = item.profile?.campaign_status ?? "planning";
          return <Link className="content-library-row pathway-project-row" href={`/admin/pathways/${item.pathway.slug}`} key={item.pathway.slug}>
            <div>
              <span className="content-kind">{item.pathway.level}</span>
              <strong>{item.pathway.title}</strong>
              <small>{item.assets.length} assets · {item.publishedAssets} published · {item.completion}% complete{item.profile?.primary_keyword ? ` · keyword ${item.profile.primary_keyword}` : ""}</small>
            </div>
            <div className="content-row-end">
              {item.socialAutomationName ? <span className="status-pill">Meta linked</span> : null}
              <span className={status === "complete" ? "status-pill" : status === "active" ? "status-pill status-pending" : "status-pill status-muted"}>{status}</span>
              <ArrowRight size={18}/>
            </div>
          </Link>;
        })}
      </div>
    </section>

    <section className="admin-card pathway-new-project-card" id="new-project">
      <div className="studio-section-head">
        <div><span className="section-kicker">New project</span><h2>Start from an existing Pathway</h2></div>
        <p>Pathways are the source of truth. Creating a project means opening one of them here and beginning its distribution package, not creating duplicate doctrine content.</p>
      </div>
      <div className="pathway-project-picker">
        {summaries.map((item) => <Link href={`/admin/pathways/${item.pathway.slug}`} key={item.pathway.slug}><div><strong>{item.pathway.title}</strong><small>{item.pathway.level}</small></div><Plus size={17}/></Link>)}
      </div>
    </section>

    <section className="admin-card pathway-explainer-card">
      <div className="studio-section-head"><div><span className="section-kicker">How this works</span><h2>One Pathway, one project, many platforms</h2></div></div>
      <div className="pathway-explainer-grid">
        <div><strong>1. Pick the Pathway</strong><p>The website and app Pathway remain the teaching source.</p></div>
        <div><strong>2. Create platform content</strong><p>Add the YouTube episode, Reels, TikToks, carousels, PDFs, thumbnails, and source files.</p></div>
        <div><strong>3. Publish and attach</strong><p>Publish directly when integrations are available or attach an already-published post.</p></div>
        <div><strong>4. Measure the result</strong><p>Studio collects platform metrics and connects keyword messaging back to the Pathway.</p></div>
      </div>
      <div className="admin-inline-actions pathway-system-link"><Link className="button button-outline" href="/admin/social">Open Social Automations <ExternalLink size={15}/></Link></div>
    </section>
  </>;
}

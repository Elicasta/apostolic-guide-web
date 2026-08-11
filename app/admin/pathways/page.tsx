import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, CircleDashed, Plus, Route, Send } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { listPathwayPublishingSummaries } from "@/pathway-publishing";

export default async function PathwayPublishingPage({ searchParams }: { searchParams?: Promise<{ pathway?: string }> }) {
  const permission = await getStudioPermission("view_content");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const summaries = await listPathwayPublishingSummaries();
  const active = summaries.filter((item) => item.profile?.campaign_status === "active").length;
  const withAssets = summaries.filter((item) => item.assets.length > 0).length;
  const withAutomation = summaries.filter((item) => item.profile?.social_automation_id).length;
  const params = searchParams ? await searchParams : {};
  const selected = params?.pathway && summaries.some((item) => item.pathway.slug === params.pathway) ? params.pathway : "";

  return <>
    <div className="studio-page-heading pathway-library-heading">
      <div>
        <span className="eyebrow">Pathway publishing</span>
        <h1>Projects</h1>
        <p className="admin-lede">Choose one existing Apostolic Guide Pathway, then manage its YouTube, Instagram, TikTok, Facebook, downloads, messaging, and live links from one place.</p>
      </div>
    </div>

    <section className="admin-card pathway-project-picker-card" id="new-project">
      <div className="pathway-project-picker-bar">
        <div><span className="section-kicker">New project</span><strong>Choose from all 20 Pathways</strong></div>
        <form method="get" className="pathway-project-picker-form">
          <select name="pathway" defaultValue={selected} aria-label="Choose a Pathway">
            <option value="">Select a Pathway…</option>
            {summaries.map((item, index) => <option value={item.pathway.slug} key={item.pathway.slug}>{String(index + 1).padStart(2, "0")} · {item.pathway.title}</option>)}
          </select>
          <button className="button button-crimson" type="submit"><Plus size={16}/> Choose</button>
          {selected ? <Link className="button button-outline" href={`/admin/pathways/${selected}`}>Open project <ArrowRight size={16}/></Link> : null}
        </form>
      </div>
      <p className="pathway-picker-help">A project does not create a new doctrine Pathway. It opens the existing Pathway inside Studio so you can build and track its distribution package.</p>
    </section>

    <div className="studio-kpi-grid studio-kpi-grid-four pathway-library-kpis">
      <div className="studio-kpi"><Route size={18}/><span>Live pathways</span><strong>{summaries.length}</strong><small>Available projects</small></div>
      <div className="studio-kpi"><CircleDashed size={18}/><span>Active campaigns</span><strong>{active}</strong><small>Currently distributing</small></div>
      <div className="studio-kpi"><CheckCircle2 size={18}/><span>With assets</span><strong>{withAssets}</strong><small>Production started</small></div>
      <div className="studio-kpi"><Send size={18}/><span>Meta flows linked</span><strong>{withAutomation}</strong><small>Keyword messaging connected</small></div>
    </div>

    <section className="admin-card studio-list-card pathway-project-list">
      <div className="studio-section-head">
        <div><span className="section-kicker">Library</span><h2>Current Pathway projects</h2></div>
        <p>All 20 existing Pathways are available. Open any one to add platform content, attach live posts, sync performance, and configure messaging.</p>
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
  </>;
}
